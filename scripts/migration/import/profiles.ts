/**
 * The profiles, `makeup_artistes` → `profils` (docs/migration/SCHEMA.md, §5.2): their identity
 * (tickets 026 and 059), their lists, networks and photos (ticket 060, ./sections.ts).
 *
 * - Taken: the profiles linked to an account the import takes. The link (`pro`), the slug, the
 *   username of the old site (`legacyUsername`, as it is), the names, the speciality, the
 *   description, the availability, the score, the « Super maquilleuse » badge and the dates.
 * - The slug is the one of the old site: the rule ported as it is (src/lib/slug.ts), computed on
 *   every profile of the source, the oldest keeping a slug two usernames share (register,
 *   `slug-stocke`).
 * - An availability never set (`null`) is « available » (register, `disponibilite-par-defaut`):
 *   the only exception to « null stays null » (SCHEMA.md, rule 2).
 * - The city typed becomes a commune of the official list, with its INSEE code, never an address
 *   (./cities.ts, ticket 063; register, `ville-en-commune`): the text typed is never copied. Its
 *   postal codes come with the commune (ticket 261).
 * - A city that names countries becomes a zone of countries, with a town abroad when there is one
 *   (register, `zone-hors-de-france`); a city the import cannot settle leaves the zone empty and
 *   writes the review of the zone (`zoneReview`: a reason, a postal code, the communes it could be),
 *   never the text. A profile of a commune holds none of these keys: the collection's defaults stand.
 * - The status is never written: the server computes it at every save from what the import writes
 *   (ticket 044). An entirely empty profile is a draft (register, `profils-vides-brouillon`), any
 *   other is published. The import leaves the choice of the status to the rule (`automatique`): a
 *   choice fixed by an earlier run, which wrote the status, goes back to the rule. It compares the
 *   status the server stored with the one the rule gives, and lists the profiles whose status is
 *   not the one the source itself gives (`statutsDifferentsDeLaSource`): a section not taken yet,
 *   or a city that gives no commune.
 * - The 13 empty profiles the spam of 10/10/2026 left without an account (SCHEMA.md §4.1) are set
 *   aside and counted, never taken (register, `profils-spam-non-repris`). Any other profile without
 *   an account in the source stops the import before any write, until the table of decisions
 *   leaves it aside (`excludedProfiles`).
 * - A profile whose account the table of decisions sets aside stops the import too, until the
 *   table leaves it aside with its account (SCHEMA.md §11).
 *
 * - Its lists, its networks and its photos are those of the old site, in their order
 *   (./sections.ts, ticket 060): a photo whose file is not adopted (./media.ts) is reported, never
 *   invented.
 *
 * - Its prices keep the text typed and gain the amount the single rule reads in it (src/lib/price.ts,
 *   ticket 062): `bilanDesPrix` counts them, and lists the profiles that would lose their priced
 *   offer or hold digits the rule does not read.
 *
 * - The network row of Strapi also holds the phone and the email of contact (ticket 064). They go
 *   into the closed group `coordonnees`, trimmed; a value that is only blanks, `null` or `undefined` is no value (as on the old site), and one the server would refuse is left out and listed for review. A
 *   profile with one of them shows it on the old site: it gets `contactPublic` true, `consentiLe`
 *   the date of the switch (a parameter of the run, never the clock) and the source `import`
 *   (« publié par la maquilleuse », register `coordonnees-consentement`). Without either: false,
 *   no date, no source. The report counts them, never shows them.
 */

import { isPriceAmount, minimumPrice, parsePrice } from '../../../src/lib/price'
import { isFullyEmpty, type ProfileFields, type ProfileNetworks } from '../../../src/lib/profile/completeness'
import { validateContactEmail, validatePhone } from '../../../src/lib/profile/contact-details'
import { type ProfileDocument, profileState, statusAfter } from '../../../src/lib/profile/state'
import { INITIAL_CHOICE, type ProfileStatus } from '../../../src/lib/profile/status'
import { RADIUS_BOUNDS_KM } from '../../../src/lib/profile/zone'
import { assignSlugs } from '../../../src/lib/slug'
import type { ExpectedCity, ExpectedCountries, ExpectedReview } from './cities'
import { type Adapter, type Expected, type Gap, normalize } from './engine'
import { REFERENCES } from './gaps'
import { entryPhotos, type PhotoNotCarriedOver } from './media'
import { EMPTY_SECTIONS, listsValues, type ReadSections, readSections, rowsInBounds, type SkippedRow } from './sections'
import { iso, type Query } from './source'

/**
 * The profiles the spam of 10/10/2026 left without an account, empty, never modified
 * (docs/migration/SCHEMA.md §4.1; decision of 13/10/2026): set aside by the import itself. The
 * list never grows on its own: any other profile without an account stops the import.
 */
export const SPAM_PROFILES: readonly number[] = [67, 74, 76, 77, 78, 79, 87, 88, 94, 95, 96, 104, 108]

/** A row of `makeup_artistes`, as the import reads it. */
export interface ProfileRow {
	id: number
	first_name: string | null
	last_name: string | null
	company_artist_name: string | null
	speciality: string | null
	description: string | null
	city: string | null
	/** The radius in km, an `integer` of Strapi (0 to 2 147 483 647): the v3 takes 0 to 200 (`rayonDeLaSource`). */
	action_radius?: number | null
	username: string | null
	/** A `decimal` of Strapi: the driver gives it as text. */
	score: string | number | null
	available: boolean | null
	/** The « Super maquilleuse » badge, not the account. */
	pro: boolean | null
	created_at: string
	updated_at: string
}

/** What a profile of the source holds besides its row: its account, its sections, and what tells whether it is empty. */
export interface ReadProfile extends ProfileRow {
	/** The account it is linked to (`makeup_artistes_user_links`), or none. */
	compte: number | null
	aPhotoPrincipale: boolean
	prix: (string | null)[]
	reseaux: ProfileNetworks | null
	/** Its lists, its networks and its photos, in their order (./sections.ts). */
	sections: ReadSections
}

const PROFILES_QUERY = `SELECT id, first_name, last_name, company_artist_name, speciality, description, city, action_radius, username,
	score, available, pro, ${iso('created_at')} AS created_at, ${iso('updated_at')} AS updated_at
	FROM makeup_artistes ORDER BY id`

const LINKS_QUERY = 'SELECT makeup_artiste_id AS profil, user_id AS compte FROM makeup_artistes_user_links ORDER BY id'

/**
 * The profiles of the source, each one with its account, its sections, and what tells whether it is
 * empty: the main picture, the prices and the networks are read in its sections.
 */
export async function readProfiles(requete: Query): Promise<ReadProfile[]> {
	const rows = await requete<ProfileRow>(PROFILES_QUERY)
	const links = await requete<{ profil: number; compte: number }>(LINKS_QUERY)
	const sections = await readSections(requete)
	const accountOf = new Map(links.map(({ profil: profile, compte: account }) => [Number(profile), Number(account)]))
	return rows.map(ligne => {
		const read = sections.get(ligne.id) ?? EMPTY_SECTIONS
		return {
			...ligne,
			compte: accountOf.get(ligne.id) ?? null,
			aPhotoPrincipale: read.photoPrincipale.length > 0,
			prix: read.prestations.map(({ price }) => price),
			reseaux: read.reseau,
			sections: read,
		}
	})
}

/**
 * What the single rule of completeness reads of a profile of the source, under the names of the
 * old site, as the old site reads it: main picture, city, speciality, offers, description, networks.
 */
export const sourceFields = (profil: ReadProfile): ProfileFields => ({
	first_name: profil.first_name,
	last_name: profil.last_name,
	company_artist_name: profil.company_artist_name,
	speciality: profil.speciality,
	city: profil.city,
	description: profil.description,
	main_picture: profil.aPhotoPrincipale ? {} : null,
	service_offers: profil.prix.map(price => ({ price })),
	network: profil.reseaux,
})

/** Whether the source itself says a profile is entirely empty: none of the six conditions. */
export const emptyToSource = (profil: ReadProfile): boolean => isFullyEmpty(sourceFields(profil))

/**
 * The status the server computes for a profile from what the import writes, by its own rule
 * (src/lib/profile/state.ts), the choice of the status left to the rule: a draft when entirely empty,
 * published otherwise.
 */
export function computedStatus(valeurs: Readonly<Record<string, unknown>>): ProfileStatus {
	const { fullyEmpty } = profileState(valeurs as ProfileDocument)
	return statusAfter({ apres: { chosenStatus: INITIAL_CHOICE }, fullyEmpty }).status
}

/** A `decimal` of Strapi as a number, or `null`. */
const count = (valeur: string | number | null | undefined): number | null =>
	valeur === null || valeur === undefined ? null : Number(valeur)

/** A radius of the source that the v3 does not take: the profile, and the value (a distance, nothing personal). */
export type RadiusToReview = { profile: number; radiusKm: number }

/**
 * The radius of action of a profile of the source (register, `rayon-200-km`): a whole number of
 * kilometres from 0 to 200 is taken as it is, nothing is empty. A radius the server would refuse
 * (above 200 km: the old site accepted up to 1 000, and the real base held 400) is never brought
 * back to 200 in silence: the field stays empty and `rayonsARevoir` lists the profile.
 */
export function sourceRadius(profil: Pick<ProfileRow, 'action_radius'>): number | null {
	const radius = count(profil.action_radius)
	if (radius === null) return null
	return Number.isInteger(radius) && radius >= RADIUS_BOUNDS_KM.min && radius <= RADIUS_BOUNDS_KM.max ? radius : null
}

/** The radius of the source that `rayonDeLaSource` leaves out, for the report. */
export function radiusToReview(profil: Pick<ProfileRow, 'id' | 'action_radius'>): RadiusToReview | null {
	const radius = count(profil.action_radius)
	return radius !== null && sourceRadius(profil) === null ? { profile: profil.id, radiusKm: radius } : null
}

/** The words the old site reads as no value (`texte()`, src/lib/profil/vue-publique.js). */
const EMPTY_WORDS = new Set(['null', 'undefined'])

/**
 * A contact detail as the old site reads it: trimmed, and nothing when it is blank or only the word
 * `null` or `undefined`, in any case. Such a value shows nothing on the old site, so it is no value.
 */
const contactDetail = (valeur: string | null | undefined): string | null => {
	const text = valeur?.trim() ?? ''
	return text === '' || EMPTY_WORDS.has(text.toLowerCase()) ? null : text
}

/** A contact detail the old site showed and the server would refuse (padding aside): which one, never its value. */
export type ContactDetailToReview = { profile: number; field: 'telephone' | 'email' }

/**
 * The phone and the email of contact of a profile of the source, under the names of Payload. A value
 * the validators of the profile refuse (a free text in the email field, a phone longer than 20
 * characters) is left out, so that the whole profile is not refused for it: it is listed by
 * `coordonneesARevoir`, and it does not open the contact details.
 */
export function sourceContactDetails(profil: ReadProfile): { telephone: string | null; email: string | null } {
	const phone = contactDetail(profil.reseaux?.phone)
	const email = contactDetail(profil.reseaux?.email)
	return {
		telephone: validatePhone(phone) === true ? phone : null,
		email: validateContactEmail(email) === true ? email : null,
	}
}

/** The contact details of a profile that are left out because the server would refuse them. */
export function contactDetailsToReview(profil: ReadProfile): ContactDetailToReview[] {
	const read = { telephone: contactDetail(profil.reseaux?.phone), email: contactDetail(profil.reseaux?.email) }
	const keptItems = sourceContactDetails(profil)
	return (['telephone', 'email'] as const)
		.filter(champ => read[champ] !== null && keptItems[champ] === null)
		.map(champ => ({ profile: profil.id, field: champ }))
}

/** The contact details as the collection stores them (`contactDetails`): the phone, the email. */
export function sourceContactInfo(profil: ReadProfile): { phone: string | null; email: string | null } {
	const { telephone: phone, email } = sourceContactDetails(profil)
	return { phone: phone, email }
}

/** Whether the old site shows a phone or an email for this profile. */
export const shownToSource = (profil: ReadProfile): boolean => {
	const { telephone: phone, email } = sourceContactDetails(profil)
	return phone !== null || email !== null
}

/**
 * The date of the switch, as the parameter of the run gives it: a day (`2026-11-02`, midnight UTC)
 * or an instant with its zone (`2026-11-02T08:00:00Z`), as an ISO string. `null` when it is
 * neither, or not a real date.
 */
export function cutoverDate(texte: string): string | null {
	if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/.test(texte)) return null
	// `Date` lets 30 February through (it reads 2 March): the day must exist in its month.
	const [year = 0, month = 0, day = 0] = texte.slice(0, 10).split('-').map(Number)
	if (new Date(Date.UTC(year, month - 1, day)).getUTCDate() !== day) return null
	const date = new Date(texte)
	return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export const PROFILES_ADAPTER: Adapter = {
	collection: 'profiles',
	fields: {
		pro: 'relation',
		slug: 'texte',
		legacyUsername: 'texte',
		firstName: 'texte',
		lastName: 'texte',
		artistName: 'texte',
		specialty: 'texte',
		description: 'texte',
		city: 'objet',
		zoneKind: 'texte',
		countries: 'liste',
		town: 'texte',
		zoneReview: 'objet',
		radiusKm: 'nombre',
		available: 'booleen',
		score: 'nombre',
		superArtist: 'booleen',
		mainPicture: 'relation',
		gallery: 'relations',
		networks: 'objet',
		contactDetails: 'objet',
		publicContact: 'booleen',
		consentedAt: 'date',
		consentSource: 'texte',
		skills: 'liste',
		languages: 'liste',
		courses: 'liste',
		experiences: 'liste',
		serviceOffers: 'liste',
		chosenStatus: 'texte',
		status: 'texte',
		createdAt: 'date',
		updatedAt: 'date',
	},
	// Computed by the server at every save (ticket 044): compared, never sent.
	computed: ['status'],
	// The zone of a commune names none of these: the collection's defaults (ticket 259) are what it expects.
	defaults: {
		zoneKind: 'city',
		countries: [],
		town: null,
		zoneReview: { reason: null, postalCode: null, candidates: null },
	},
	// The date of the consent is the one of the first run that gave it: a later run with another date of
	// the switch keeps it (ticket 227). The server dates it again when the contact details are closed
	// then opened (src/lib/profile/contact-details.ts), and the field is empty then, so the run fills it in.
	seeds: ['consentedAt'],
}

/**
 * The profiles on a target the v3 already uses (`--target-in-service`, ticket 227): a profile the target
 * holds is left exactly as it is, every field of it. A makeup artist who closed her phone or her email,
 * moved her commune or changed her lists and photos in the v3 would otherwise get the old site back,
 * with a public phone and the consent of the import. Only a profile the target misses is created.
 */
export const PROFILES_IN_SERVICE_ADAPTER: Adapter = {
	...PROFILES_ADAPTER,
	frozen: Object.keys(PROFILES_ADAPTER.fields),
}

/**
 * The profiles whose date of consent differs from the date this run asks for: the target keeps the
 * date it holds (`amorces`), the run counts the difference. Identifiers only.
 */
export function keptConsents(
	attendus: readonly Expected[],
	existants: readonly { values: Readonly<Record<string, unknown>> }[]
): number[] {
	const keptItems = new Map(
		existants.map(({ values }) => [Number(values.strapiId), normalize('date', values.consentedAt)] as const)
	)
	return attendus
		.filter(({ strapiId, values }) => {
			const requested = normalize('date', values.consentedAt)
			const kept = keptItems.get(strapiId)
			return requested !== null && kept !== undefined && kept !== null && kept !== requested
		})
		.map(({ strapiId }) => strapiId)
		.sort((a, b) => a - b)
}

/** The profiles the import does not take, and those that stop it, split by what the table says of them. */
export interface SkippedProfiles {
	/** Profiles a decision leaves aside (`excludedProfiles`): with their account set aside, or without an account. */
	excluded: number[]
	/** The profiles of the spam (`PROFILS_DU_SPAM`) the source holds without an account: set aside, counted. */
	spam: number[]
	/** Profiles of an account a decision sets aside, that no decision names: they stop the import (SCHEMA.md §11). */
	ofExcludedAccounts: number[]
	/** Profiles without an account in the source, out of the list of the spam, that no decision names: they stop it. */
	withoutAccount: number[]
	/** Decisions that name none of these profiles: without effect. */
	pointless: number
}

/**
 * The profiles left aside or stopping the import, given the accounts the source holds, the
 * accounts a decision sets aside, and the profiles a decision leaves aside.
 *
 * - A profile without an account in the source (no link, or a link to an account the source no
 *   longer holds) is set aside when it is in the list of the spam; otherwise it needs a decision.
 * - A profile of an account a decision sets aside needs a decision.
 * - A decision is without effect when it names none of these cases: a profile of the spam, of an
 *   account that is taken, or that the source no longer holds.
 */
export function skippedProfiles(
	profils: readonly ReadProfile[],
	{
		sourceAccounts: comptesDeLaSource,
		excludedAccounts: comptesEcartes,
		excludedProfiles: profilsEcartes,
	}: {
		sourceAccounts: ReadonlySet<number>
		excludedAccounts: readonly number[]
		excludedProfiles: readonly number[]
	}
): SkippedProfiles {
	const excludedByDecision = new Set(comptesEcartes)
	const decides = new Set(profilsEcartes)
	const spamList = new Set(SPAM_PROFILES)
	const skipped: SkippedProfiles = { excluded: [], spam: [], ofExcludedAccounts: [], withoutAccount: [], pointless: 0 }
	const concerned = new Set<number>()
	for (const { id, compte: account } of [...profils].sort((a, b) => a.id - b.id)) {
		const withoutAccount = account === null || !comptesDeLaSource.has(account)
		if (withoutAccount && spamList.has(id)) skipped.spam.push(id)
		else if (withoutAccount || (account !== null && excludedByDecision.has(account))) {
			concerned.add(id)
			if (decides.has(id)) skipped.excluded.push(id)
			else skipped[withoutAccount ? 'withoutAccount' : 'ofExcludedAccounts'].push(id)
		}
	}
	skipped.pointless = [...decides].filter(id => !concerned.has(id)).length
	return skipped
}

/** What the prices of a run give, in numbers and identifiers (ticket 062). */
export interface PriceSummary {
	/** Prices of the profiles taken: one per offer and one per option. */
	prices: number
	/** Among them, the prices that give an amount. */
	withAmount: number
	/** The prices in free text: the text is kept, the amount is empty. */
	freeTexts: number
	/** The prices with nothing typed. */
	withoutText: number
	/** Profiles taken whose offers hold an amount at the source, by the rule of the old site. */
	profilesWithPricedOffer: number
	/** Profiles that hold an amount at the source and have none in the target: the gaps, listed. */
	lostPricedOffers: number[]
	/** Profiles with a text that holds digits and gives no amount (« 2 h : 150 € »): the text is kept, listed. */
	unreadDigits: number[]
}

type PriceWritten = { priceText?: string | null; priceFrom?: number | null }

/** The prices written for one profile: its offers, then their options. */
function serviceOffersPrice(prestations: unknown): PriceWritten[] {
	return ((prestations ?? []) as (PriceWritten & { options?: PriceWritten[] })[]).flatMap(offre => [
		offre,
		...(offre.options ?? []),
	])
}

/**
 * Whether the source gives a priced offer to a profile and the target holds none: the smallest
 * price of a card counts the offers only, never their options (`minimumPrice`, ticket 032). So an
 * option with an amount does not hide an offer that lost its own.
 */
export function lostPricedOffer(prixDuSource: readonly (string | null)[], ecrites: readonly PriceWritten[]): boolean {
	const pricedToSource = prixDuSource.some(price => parsePrice(price).priceFrom !== null)
	return pricedToSource && minimumPrice(ecrites) === null
}

/** The zones other than a commune that the profiles must hold (./cities.ts): countries, and the review of an empty zone. */
export interface ExpectedZones {
	countries?: ReadonlyMap<number, ExpectedCountries>
	reviews?: ReadonlyMap<number, ExpectedReview>
}

export interface ExpectedProfiles {
	expected: Expected[]
	/** How many profiles the run takes per status, as the server computes it. */
	statuses: Record<string, number>
	/**
	 * Profiles whose status, as the server computes it from what the import writes, is not the one
	 * the source gives (a draft when entirely empty at the source, published otherwise): a section
	 * the import does not take yet, or a city that gives no commune.
	 */
	statusesDifferingFromSource: number[]
	/** Photos of the profiles taken whose file is not adopted. */
	photosNotCarriedOver: PhotoNotCarriedOver[]
	/** Profiles taken with a link of a list that names no row. */
	linksWithoutRow: number[]
	/** The prices, in numbers and identifiers. */
	prices: PriceSummary
	/** Contact details left out because the server would refuse them: by profile and field, never the value. */
	contactDetailsToReview: ContactDetailToReview[]
	/** Radii above the 200 km of the v3: the field is empty, the profile is taken (register, `rayon-200-km`). */
	radiiToReview: RadiusToReview[]
	/** Rows of a list outside a bound of the v3, left out of their profile: by profile, list and rank, never the text. */
	skippedRows: SkippedProfileRow[]
}

/** A row of a profile left out because the server would refuse the whole profile for it. */
export type SkippedProfileRow = SkippedRow & { profile: number }

/**
 * The profiles the target must hold. `comptes` gives, for each account the import takes, its
 * identifier in Payload, or `null` while it is still to be created (a dry run). `laisses` names
 * the profiles the import does not take (`profilsLaisses`): a profile out of both is linked to an
 * account the import takes, or the import stopped before. `communes` gives the commune of each
 * profile taken (./cities.ts); a profile it does not name has none. `medias` gives, for each
 * file adopted (./media.ts), its identifier in Payload, or `null` while it is still to be
 * created; a file it does not name is not adopted. `consentiLe` is the date of the switch, an ISO
 * string (`dateDeBascule`): given whenever a profile shows contact details at the source.
 */
export function expectedProfiles(
	profils: readonly ReadProfile[],
	comptes: ReadonlyMap<number, number | null>,
	laisses: Pick<SkippedProfiles, 'excluded' | 'spam'> = { excluded: [], spam: [] },
	communes: ReadonlyMap<number, ExpectedCity | null> = new Map(),
	medias: ReadonlyMap<number, number | null> = new Map(),
	consentiLe: string | null = null,
	maintenant: Date = new Date(),
	zones: ExpectedZones = {}
): ExpectedProfiles {
	const notTaken = new Set([...laisses.excluded, ...laisses.spam])
	// The slugs of the old site, computed on every profile of the source, as the old site did.
	const slugs = new Map(
		assignSlugs(profils.map(({ id, username, created_at }) => ({ id, username, createdAt: created_at }))).map(
			({ id, slug }) => [Number(id), slug]
		)
	)
	const expected: Expected[] = []
	const statuses: Record<string, number> = {}
	const sourceDifferentStatuses: number[] = []
	const photosNotCarriedOver: PhotoNotCarriedOver[] = []
	const linksWithoutRow: number[] = []
	const prices: PriceSummary = {
		prices: 0,
		withAmount: 0,
		freeTexts: 0,
		withoutText: 0,
		profilesWithPricedOffer: 0,
		lostPricedOffers: [],
		unreadDigits: [],
	}
	const toReview: ContactDetailToReview[] = []
	const radiiToReview: RadiusToReview[] = []
	const skippedRows: SkippedProfileRow[] = []
	for (const profile of profils) {
		if (notTaken.has(profile.id)) continue
		if (profile.compte === null || !comptes.has(profile.compte))
			throw new Error(`Le profil ${profile.id} n’a pas de compte repris : l’import aurait dû s’arrêter avant.`)
		const slug = slugs.get(profile.id) ?? null
		const { sections } = profile
		// The main picture is the first file of its field; Strapi holds one.
		const main = entryPhotos(sections.photoPrincipale.slice(0, 1), medias)
		const gallery = entryPhotos(sections.galerie, medias)
		for (const file of [...main.nonReprises, ...gallery.nonReprises])
			photosNotCarriedOver.push({ entry: profile.id, file: file })
		if (sections.liensSansLigne > 0) linksWithoutRow.push(profile.id)
		toReview.push(...contactDetailsToReview(profile))
		const radius = radiusToReview(profile)
		if (radius) radiiToReview.push(radius)
		// A row outside a bound of the v3 is left out and listed: kept, it would make the server refuse the whole profile.
		const bounded = rowsInBounds(sections, maintenant)
		skippedRows.push(...bounded.laissees.map(ligne => ({ profile: profile.id, ...ligne })))
		const shown = shownToSource(profile)
		if (shown && consentiLe === null)
			throw new Error(
				`Le profil ${profile.id} affiche des coordonnées : la date de bascule manquait, l’import aurait dû s’arrêter avant.`
			)
		const values: Record<string, unknown> = {
			strapiId: profile.id,
			pro: comptes.get(profile.compte) ?? null,
			slug,
			legacyUsername: profile.username,
			firstName: profile.first_name,
			lastName: profile.last_name,
			artistName: profile.company_artist_name,
			specialty: profile.speciality,
			description: profile.description,
			city: communes.get(profile.id) ?? null,
			radiusKm: sourceRadius(profile),
			available: profile.available ?? true,
			score: count(profile.score),
			superArtist: profile.pro,
			mainPicture: main.ids[0] ?? null,
			gallery: gallery.ids,
			...listsValues(bounded.sections),
			contactDetails: sourceContactInfo(profile),
			publicContact: shown,
			consentedAt: shown ? consentiLe : null,
			consentSource: shown ? 'import' : null,
			chosenStatus: INITIAL_CHOICE,
			createdAt: profile.created_at,
			updatedAt: profile.updated_at,
		}
		const countriesZone = zones.countries?.get(profile.id)
		const review = zones.reviews?.get(profile.id)
		if (countriesZone) {
			values.zoneKind = 'countries'
			values.countries = countriesZone.countries
			values.town = countriesZone.town
		}
		if (review) values.zoneReview = review
		// The status reads whether the main picture is adopted, even before its media exists (a dry run).
		const status = computedStatus({ ...values, mainPicture: main.adoptees > 0 ? true : null })
		values.status = status
		statuses[status] = (statuses[status] ?? 0) + 1
		if ((status === 'draft') !== emptyToSource(profile)) sourceDifferentStatuses.push(profile.id)
		const gaps: Gap[] = []
		const written = serviceOffersPrice(values.serviceOffers)
		for (const { priceText, priceFrom } of written) {
			prices.prices += 1
			if (priceFrom !== null && priceFrom !== undefined) prices.withAmount += 1
			else if ((priceText?.trim() ?? '') === '') prices.withoutText += 1
			else prices.freeTexts += 1
		}
		if (written.some(({ priceFrom }) => isPriceAmount(priceFrom)))
			gaps.push({ field: 'serviceOffers', reference: REFERENCES.prixNumerique })
		const offersPrice = sections.prestations.map(({ price }) => price)
		if (offersPrice.some(price => parsePrice(price).priceFrom !== null)) prices.profilesWithPricedOffer += 1
		if (lostPricedOffer(offersPrice, (values.serviceOffers ?? []) as PriceWritten[]))
			prices.lostPricedOffers.push(profile.id)
		if (written.some(({ priceText, priceFrom }) => priceFrom === null && /\d/.test(priceText ?? '')))
			prices.unreadDigits.push(profile.id)
		if (radius) gaps.push({ field: 'radiusKm', reference: REFERENCES.rayon200Km })
		if (slug !== profile.username) gaps.push({ field: 'slug', reference: REFERENCES.slugStocke })
		if ((profile.city?.trim() ?? '') !== '') gaps.push({ field: 'city', reference: REFERENCES.villeEnCommune })
		if (countriesZone) gaps.push({ field: 'zoneKind', reference: REFERENCES.zoneHorsDeFrance })
		if (profile.available === null) gaps.push({ field: 'available', reference: REFERENCES.disponibiliteParDefaut })
		if (status === 'draft')
			gaps.push({
				field: 'status',
				reference: emptyToSource(profile) ? REFERENCES.profilVideEnBrouillon : REFERENCES.profilNonVideEnBrouillon,
			})
		if (shown) gaps.push({ field: 'publicContact', reference: REFERENCES.coordonneesConsenties })
		expected.push({ strapiId: profile.id, values: values, gaps: gaps })
	}
	return {
		expected: expected,
		statuses: statuses,
		statusesDifferingFromSource: sourceDifferentStatuses,
		photosNotCarriedOver: photosNotCarriedOver,
		linksWithoutRow: linksWithoutRow,
		prices: prices,
		contactDetailsToReview: toReview,
		radiiToReview: radiiToReview,
		skippedRows: skippedRows,
	}
}
