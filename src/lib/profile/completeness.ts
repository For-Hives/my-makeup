/**
 * The single definition of a profile (plans/04 §2.4, plans/02 U01-U08): how complete it is, whether
 * it is entirely empty, active or publishable, and what it lacks. The schema hook, the artist's
 * space, the search and the sitemap read this file; none of them computes its own.
 *
 * Ported as is from the old site: src/lib/profil/completude.js of the front (branch main), and, for
 * the six conditions and the entirely empty profile, src/utils/profile-conditions.js of the API
 * (the search without empty profiles, 13/10/2026). The same profile gives the same result:
 *
 * - score out of 13: the 13 criteria of the progress bar, for display only;
 * - the six conditions of a publishable profile: a main picture, a usable city, a speciality, an
 *   offer with a numeric price, a description of 200 characters at least, a contact channel;
 * - `actif` = main picture + usable city + speciality;
 * - `publiable` = the six conditions, and not an internal account;
 * - `completelyEmpty` = none of the six conditions. A name alone leaves a profile entirely empty;
 *   one condition is enough not to be.
 *
 * The quote form is no contact channel. The option `formulaireDevis` exists as on the old site,
 * where nothing turns it on, and it never counts among the six conditions.
 *
 * The fields keep their names of the old site (ProfileFields), so that the cases shared with it
 * (tests/unit/fixtures/completeness-cases.json) run unchanged. A caller maps its own document to them.
 * A picture is an object or a list, never a bare id: the type refuses a number, and at run time a
 * number counts as no picture.
 *
 * No server code here: the artist's space runs the same function in the browser.
 */

// Relative imports on purpose: the collection `profils` calls this file at every save (ticket 044),
// and the collections are also loaded by the Payload CLI, outside of Next.
import { parsePrice } from '../price'
import { publicCity } from './public-place'

/** The 13 criteria of the progress bar, in display order */
export const CRITERIA = [
	'nom',
	'specialite',
	'nom_artiste',
	'ville',
	'description',
	'photo',
	'competences',
	'experiences',
	'formations',
	'offres',
	'reseaux',
	'langues',
	'galerie',
] as const

export type Criterion = (typeof CRITERIA)[number]

/** Contact channels of the `network` of a profile */
export const CHANNELS = ['youtube', 'instagram', 'facebook', 'website', 'linkedin', 'phone', 'email'] as const

export type Channel = (typeof CHANNELS)[number]

/** Length from which a description counts for a publishable profile */
export const DESCRIPTION_MIN = 200

/** One service offer: only its price, as typed, is read */
export interface ProfileOffer {
	readonly price?: string | null
}

/** The contact channels of a profile, as typed */
export type ProfileNetworks = { readonly [C in Channel]?: string | null }

/**
 * What the rule reads of a profile, under the names of the old site.
 * `main_picture` and `image_gallery`: a media as the old API returns it (`{ data: … }`), a flat
 * object, or a list; never a bare id.
 */
export interface ProfileFields {
	readonly first_name?: string | null
	readonly last_name?: string | null
	readonly speciality?: string | null
	readonly company_artist_name?: string | null
	readonly city?: string | null
	readonly description?: string | null
	readonly main_picture?: object | null
	readonly image_gallery?: object | null
	readonly skills?: readonly unknown[] | null
	readonly experiences?: readonly unknown[] | null
	readonly courses?: readonly unknown[] | null
	readonly service_offers?: readonly (ProfileOffer | null)[] | null
	readonly network?: ProfileNetworks | null
	readonly language?: readonly unknown[] | null
}

export interface CompletenessOptions {
	/**
	 * The quote form is online on the profiles and counts as the contact channel of `publiable`.
	 * Off by default, and nothing turns it on: as on the old site today.
	 */
	readonly formulaireDevis?: boolean
}

/** The six conditions of a publishable profile */
export interface PublishableConditions {
	/** A main picture */
	readonly photoPrincipale: boolean
	/** The public city is a commune or a postal code, not a country, a street nor free text */
	readonly villeExploitable: boolean
	/** A speciality */
	readonly specialite: boolean
	/** The first number read in the price of one offer is between 5 and 10 000 */
	readonly offreChiffree: boolean
	/** A description of 200 characters at least, edge spaces ignored, runs of spaces counted once */
	readonly descriptionLongue: boolean
	/** One of the contact channels is filled; the quote form is none */
	readonly canalDeContact: boolean
}

export interface Completeness {
	/** Criteria met, out of 13 */
	readonly score: number
	readonly sur: 13
	/** Missing criteria, in display order */
	readonly manquants: Criterion[]
	readonly actif: boolean
	readonly publiable: boolean
	/** Internal account of the team: never publishable */
	readonly interne: boolean
	readonly conditions: PublishableConditions
	/** None of the six conditions: the search does not list such a profile */
	readonly entierementVide: boolean
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const filled = (v: unknown): boolean => text(v) !== ''
const isList = (v: unknown): v is readonly unknown[] => Array.isArray(v)
const list = (v: unknown): boolean => isList(v) && v.length > 0

/** A media of the old API (`{ data: … }`) or flat: true when there is at least one picture. */
export function aMedia(v: unknown): boolean {
	if (v === null || v === undefined) return false
	if (isList(v)) return v.length > 0
	if (typeof v === 'object') return 'data' in v ? aMedia(v.data) : true
	return false
}

/** Lower case, no accents, single spaces. */
export function normalize(v: unknown): string {
	return text(v)
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
}

const NOT_A_CITY = new Set([
	'france',
	'fr',
	'toute la france',
	'partout',
	'partout en france',
	'monde',
	'europe',
	'international',
	'null',
	'undefined',
	'-',
	'.',
])

/**
 * Usable city: the public place of the field (publicCity: the commune of a postal address,
 * « Annecy (74) », never its street) is a town or a postcode, not a country, not free text. An
 * address without a commune nor a postal code (« 3 avenue X ») is not usable, nor a text that
 * starts with a number other than a postal code (« 74 et alentours »).
 */
export function usableCity(city: unknown): boolean {
	const v = normalize(publicCity(city))
	if (v === '' || NOT_A_CITY.has(v)) return false
	if (/^\d+,? /.test(v) && !/^\d{5}\b/.test(v)) return false
	if (!(/[a-z]/.test(v) || /\b\d{5}\b/.test(v))) return false
	return v.split(' ').length <= 6
}

/**
 * First amount read in a text price (« à partir de 80 € », « 1 200 € »), or null (« Sur devis »,
 * out of 5 to 10 000). The reading itself is the single price rule of src/lib/price.ts.
 */
export function numericPrice(price: unknown): number | null {
	return parsePrice(price).priceFrom
}

/** Length of the description, leading and trailing spaces ignored, runs of spaces counted once. */
export function descriptionLength(description: unknown): number {
	return text(description).replace(/\s+/g, ' ').length
}

/** Internal account of the team (speciality « CEO/CTO My Makeup »): never publishable. */
export function isInternal(profil: ProfileFields | null | undefined): boolean {
	const s = normalize(profil?.speciality)
	return /\b(ceo|cto)\b/.test(s) || /\bmy ?-?make ?-?up\b/.test(s)
}

/** True when one of the contact channels is filled. */
export function hasContactChannel(network: ProfileNetworks | null | undefined): boolean {
	if (network === null || network === undefined) return false
	return CHANNELS.some(canal => filled(network[canal]))
}

/** Which of the six conditions of a publishable profile a profile meets. */
export function publishableConditions(profil: ProfileFields | null | undefined): PublishableConditions {
	const p = profil ?? {}
	const offers = isList(p.service_offers) ? p.service_offers : []
	return {
		photoPrincipale: aMedia(p.main_picture),
		villeExploitable: usableCity(p.city),
		specialite: filled(p.speciality),
		offreChiffree: offers.some(offre => numericPrice(offre?.price) !== null),
		descriptionLongue: descriptionLength(p.description) >= DESCRIPTION_MIN,
		canalDeContact: hasContactChannel(p.network),
	}
}

const none = (conditions: PublishableConditions): boolean => !Object.values(conditions).some(Boolean)

/** True when a profile meets none of the six conditions. */
export function isFullyEmpty(profil: ProfileFields | null | undefined): boolean {
	return none(publishableConditions(profil))
}

/** The whole reading of a profile: score, missing criteria, conditions and flags. */
export function completeness(
	profil: ProfileFields | null | undefined,
	options: CompletenessOptions = {}
): Completeness {
	const p = profil ?? {}
	const conditions = publishableConditions(p)
	const presents: Record<Criterion, boolean> = {
		nom: filled(p.last_name) && filled(p.first_name),
		specialite: conditions.specialite,
		nom_artiste: filled(p.company_artist_name),
		ville: filled(p.city),
		description: filled(p.description),
		photo: conditions.photoPrincipale,
		competences: list(p.skills),
		experiences: list(p.experiences),
		formations: list(p.courses),
		offres: list(p.service_offers),
		reseaux: conditions.canalDeContact,
		langues: list(p.language),
		galerie: aMedia(p.image_gallery),
	}
	const missing = CRITERIA.filter(critere => !presents[critere])
	const internal = isInternal(p)
	const active = conditions.photoPrincipale && conditions.villeExploitable && conditions.specialite
	const contact = conditions.canalDeContact || options.formulaireDevis === true
	const publishable = active && conditions.offreChiffree && conditions.descriptionLongue && contact && !internal
	return {
		score: CRITERIA.length - missing.length,
		sur: 13,
		manquants: missing,
		actif: active,
		publiable: publishable,
		interne: internal,
		conditions,
		entierementVide: none(conditions),
	}
}

/**
 * True when a save made the profile publishable: it was not before the save, and it is with what
 * the server stored. Never the other way round.
 */
export function becomesPublishable(
	avant: ProfileFields | null | undefined,
	apres: ProfileFields | null | undefined,
	options: CompletenessOptions = {}
): boolean {
	return !completeness(avant, options).publiable && completeness(apres, options).publiable
}
