/**
 * Where a profile stands, as the server stores it at every save (ticket 044; plan 01 §5 P3; plan
 * 02 I20; docs/migration/SCHEMA.md §9): its completeness score, whether it is active, publishable
 * or entirely empty, the date each of these three took its current value, and the status that
 * follows from them.
 *
 * The reading itself is the single rule ported from the old site, src/lib/profile/completeness.ts:
 * this file only maps a document of `profiles` to the fields that rule reads (`profileFields`),
 * then says what the collection stores. Nothing here computes a condition on its own.
 *
 * The status (src/lib/profile/status.ts) follows the rule while an admin has chosen nothing else:
 * an entirely empty profile is a draft, any other is published, both ways. A status an admin
 * chose (`chosenStatus`) is never overwritten, and a hidden profile stays hidden whatever the save.
 *
 * Relative imports on purpose: the collection that calls this file is also loaded by the Payload
 * CLI, outside of Next.
 */

import { countryByCode, FRANCE_CODE, normalizedCountryCode } from '../countries'
import { isPriceAmount } from '../price'
import { completeness, type ProfileFields, usableCity } from './completeness'
import {
	INITIAL_CHOICE,
	INITIAL_STATUS,
	PROFILE_STATUSES,
	type ProfileStatus,
	STATUS_CHOICES,
	type StatusChoice,
} from './status'

/** The networks of a profile, as the collection names them. */
interface DocumentNetworks {
	readonly youtube?: string | null
	readonly facebook?: string | null
	readonly instagram?: string | null
	readonly website?: string | null
	readonly linkedin?: string | null
}

/**
 * What the rule reads of a document of `profiles`, any field absent: the data of a save once the
 * access rules have run, or a stored document. A photo is an identifier or a media.
 */
export interface ProfileDocument {
	readonly firstName?: string | null
	readonly lastName?: string | null
	readonly artistName?: string | null
	readonly specialty?: string | null
	readonly description?: string | null
	readonly city?: { readonly name?: string | null; readonly inseeCode?: string | null } | null
	/** `countries` reads the countries; anything else (or nothing) reads the commune. */
	readonly zoneKind?: string | null
	readonly countries?: readonly string[] | null
	readonly mainPicture?: unknown
	readonly gallery?: readonly unknown[] | null
	readonly skills?: readonly unknown[] | null
	readonly experiences?: readonly unknown[] | null
	readonly courses?: readonly unknown[] | null
	readonly languages?: readonly unknown[] | null
	readonly serviceOffers?: readonly ({ readonly priceFrom?: number | null } | null)[] | null
	readonly networks?: DocumentNetworks | null
	readonly contactDetails?: { readonly phone?: string | null; readonly email?: string | null } | null
	readonly publicContact?: boolean | null
}

/**
 * The city the rule reads for a commune: its name, and only next to its INSEE code.
 *
 * Every name of the official list (14/10/2026) is a usable city for the rule as it is, but one:
 * « Pont de Montvert - Sud Mont Lozère » (48116), seven words with its spaced hyphen, over the six
 * the rule allows. A name the rule refuses is so read once more with its spaced hyphens joined, as
 * the other names of the list write them (« Pont de Montvert-Sud Mont Lozère »). A name the rule
 * reads is passed as it is; a text that is no city (« France », « Partout ») stays none.
 */
function cityName(commune: ProfileDocument['city']): string | null {
	if (!commune?.inseeCode || typeof commune.name !== 'string') return null
	return usableCity(commune.name) ? commune.name : commune.name.replace(/\s+-\s+/g, '-')
}

/**
 * The city the rule reads for a zone of countries (ticket 260): the name of the first foreign
 * country, which the rule takes for a usable city (src/lib/countries.ts, tested on the whole list).
 * France is no foreign country, so a zone of France alone reads nothing; neither does an empty one.
 */
function countryCityName(countries: ProfileDocument['countries']): string | null {
	for (const code of countries ?? []) {
		const normalized = normalizedCountryCode(code)
		if (normalized !== FRANCE_CODE) {
			const country = countryByCode(normalized)
			if (country) return country.name
		}
	}
	return null
}

/** The city the rule reads for the zone of a document: its commune, or the first foreign country of its countries. */
function zoneCityName(document: ProfileDocument): string | null {
	// Same test as formatZone (zoneCountries): 'countries' reads the countries, 'city' the commune,
	// and an empty type (null or absent) the commune when it has a name, the countries otherwise.
	const cityText = cityName(document.city)
	if (document.zoneKind === 'countries') return countryCityName(document.countries)
	if (document.zoneKind === 'city' || cityText !== null) return cityText
	return countryCityName(document.countries)
}

/**
 * A document of `profiles` under the names of the old site, as the single rule reads it.
 *
 * - The city is the name of the commune (ticket 041), and only a commune with its INSEE code: the
 *   server stores no other (`cityName`). For a zone of countries it is the name of the first
 *   foreign country (`countryCityName`, ticket 260); a zone of communes reads as it always did.
 * - A photo is passed as an object, never as a bare identifier, which the rule would count as no
 *   photo; the gallery as its list.
 * - The price of an offer is its amount (`priceFrom`, read from the text typed by the same
 *   rule, src/lib/price.ts): an offer with a text and no amount (« Sur devis ») has no numeric price,
 *   as for the cards (`minimumPrice`). The options of an offer do not count, as on the old site.
 * - The phone and the email count as contact channels only when she shows them (`publicContact`):
 *   a channel nobody sees is no channel.
 */
export function profileFields(document: ProfileDocument | null | undefined): ProfileFields {
	const d = document ?? {}
	const networks = d.networks ?? {}
	const shown = d.publicContact === true
	return {
		first_name: d.firstName,
		last_name: d.lastName,
		speciality: d.specialty,
		company_artist_name: d.artistName,
		city: zoneCityName(d),
		description: d.description,
		main_picture: d.mainPicture === null || d.mainPicture === undefined ? null : { id: d.mainPicture },
		image_gallery: d.gallery ?? null,
		skills: d.skills,
		experiences: d.experiences,
		courses: d.courses,
		language: d.languages,
		service_offers: (d.serviceOffers ?? []).map(offre => {
			const amount = offre?.priceFrom
			return { price: isPriceAmount(amount) ? String(amount) : null }
		}),
		network: {
			youtube: networks.youtube,
			facebook: networks.facebook,
			instagram: networks.instagram,
			website: networks.website,
			linkedin: networks.linkedin,
			phone: shown ? d.contactDetails?.phone : null,
			email: shown ? d.contactDetails?.email : null,
		},
	}
}

/** What the single rule says of a profile, as the collection stores it. */
export interface ProfileState {
	/** Criteria met, out of 13: the progress bar of the space */
	readonly completeness: number
	/** Main photo, usable city and speciality */
	readonly active: boolean
	/** The six conditions, and not an internal account */
	readonly publishable: boolean
	/** None of the six conditions */
	readonly fullyEmpty: boolean
}

/** The state of a profile, by the single rule (src/lib/profile/completeness.ts). */
export function profileState(document: ProfileDocument | null | undefined): ProfileState {
	const {
		score,
		actif: active,
		publiable: publishable,
		entierementVide: completelyEmpty,
	} = completeness(profileFields(document))
	return { completeness: score, active: active, publishable: publishable, fullyEmpty: completelyEmpty }
}

/** For each flag of the state, the field of the date it took its current value. */
export const TRANSITION_DATES = {
	active: 'activeSince',
	publishable: 'publishableSince',
	fullyEmpty: 'fullyEmptySince',
} as const

type Flag = keyof typeof TRANSITION_DATES
type TransitionDate = (typeof TRANSITION_DATES)[Flag]

/** What the collection stores of the status, before or after a save. */
export interface StoredStatus {
	readonly status?: unknown
	readonly chosenStatus?: unknown
}

const isStatus = (statut: unknown): statut is ProfileStatus => (PROFILE_STATUSES as readonly unknown[]).includes(statut)

const isChoice = (choix: unknown): choix is StatusChoice => (STATUS_CHOICES as readonly unknown[]).includes(choix)

/**
 * The choice of the status and the status, after a save.
 *
 * - An admin chooses in `chosenStatus`: `automatic` (the rule), or a status the profile keeps
 *   whatever is saved. Only a choice that differs from the stored one changes it: a save that
 *   sends the stored choice again (the admin panel sends every field, even from a form loaded
 *   before the makeup artist's last save) leaves it as it is, and the rule decides.
 * - No API writes `status`: the access rules drop it. Server code that writes it, rules lifted
 *   (the import, a seed, a test), makes it the choice when it differs from the stored status: a
 *   status no rule gave is a decision. A choice written in the same save wins over it.
 * - The status is the choice, or, while the choice is `automatic`, the rule: an entirely empty
 *   profile is a draft, any other is published.
 * - `hidden` never comes from the rule: a hidden profile stored with no choice (from before this
 *   field) stays hidden, and keeps `hidden` as its choice.
 *
 * `avant` is what was stored, nothing for a creation; `apres` is what the save holds once the
 * access rules have run. A status or a choice that is none of the known ones counts as the
 * initial one.
 */
export function statusAfter({
	avant,
	apres,
	fullyEmpty,
}: {
	avant?: StoredStatus | null
	apres: StoredStatus
	fullyEmpty: boolean
}): { status: ProfileStatus; chosenStatus: StatusChoice } {
	const storedStatus = isStatus(avant?.status) ? avant.status : INITIAL_STATUS
	const storedChoice = isChoice(avant?.chosenStatus) ? avant.chosenStatus : INITIAL_CHOICE
	const keptChoice: StatusChoice =
		storedStatus === 'hidden' && storedChoice === INITIAL_CHOICE ? 'hidden' : storedChoice
	let chosenStatus = keptChoice
	if (isChoice(apres.chosenStatus) && apres.chosenStatus !== storedChoice) chosenStatus = apres.chosenStatus
	else if (isStatus(apres.status) && apres.status !== storedStatus) chosenStatus = apres.status
	if (chosenStatus === 'automatic') return { status: fullyEmpty ? 'draft' : 'published', chosenStatus }
	return { status: chosenStatus, chosenStatus }
}

/** What the server writes on a profile at every save: the state, its dates, the status. */
export type StateWrite = ProfileState &
	Record<TransitionDate, string> & { status: ProfileStatus; chosenStatus: StatusChoice }

/**
 * What a save stores, whatever the request sent on these fields: the state by the single rule; for
 * each flag, the date it took its current value (kept while the value stays, `maintenant` when it
 * changes, and at the creation); the choice of the status and the status.
 *
 * `avant` is the stored document, nothing for a creation; `apres` is the document the save holds
 * once the access rules have run.
 */
export function stateAfterSave({
	avant,
	apres,
	maintenant,
}: {
	avant?: Readonly<Partial<Record<Flag | TransitionDate, unknown>>> & StoredStatus
	apres: ProfileDocument & StoredStatus
	maintenant: Date
}): StateWrite {
	const state = profileState(apres)
	const since = (drapeau: Flag): string => {
		const date = avant?.[TRANSITION_DATES[drapeau]]
		const kept = avant?.[drapeau] === state[drapeau] && (typeof date === 'string' || date instanceof Date)
		return kept ? new Date(date).toISOString() : maintenant.toISOString()
	}
	return {
		...state,
		activeSince: since('active'),
		publishableSince: since('publishable'),
		fullyEmptySince: since('fullyEmpty'),
		...statusAfter({ avant, apres, fullyEmpty: state.fullyEmpty }),
	}
}
