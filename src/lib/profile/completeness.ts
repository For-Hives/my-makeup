/**
 * The single definition of a profile (plans/04 §2.4, plans/02 U01-U08): how complete it is, whether
 * it is entirely empty, active, publishable or indexable, and what it lacks. The schema hook, the
 * artist's space, the search and the sitemap read this file; none of them computes its own.
 *
 * Ported from the old site (src/lib/profil/completude.js of the front, branch main; for the entirely
 * empty profile, src/utils/profile-conditions.js of the API), then lightened on purpose by the
 * decision of the maintainer of 27/10/2026 (docs/migration/CHANGEMENTS-VOULUS.md, « publication allégée »):
 * only about 15 profiles of 100 met the six old conditions, and the price and the long description
 * were what stopped the others.
 *
 * - score out of 13: the 13 criteria of the progress bar, for display only;
 * - the four conditions of a PUBLISHABLE profile (visible in the search and on the site): a main
 *   picture, a usable city, a speciality, a contact channel. A page with no way to reach her is of
 *   no use to a visitor: it is the only social requirement kept;
 * - `actif` = main picture + usable city + speciality;
 * - `publiable` = the four conditions, and not an internal account;
 * - the richness of a profile (`richness`), which only decides whether Google may index it: a
 *   description of 100 characters at least, an offer with a numeric price, a photo in the gallery;
 * - `indexable` = publishable AND a description of 100 characters at least AND (an offer with a
 *   numeric price OR a gallery photo). A publishable profile that is not indexable stays visible,
 *   in noindex, out of the sitemap and out of the structured data;
 * - `completelyEmpty` = none of the four conditions, no priced offer and no description of 100
 *   characters. A name alone leaves a profile entirely empty; one of these is enough not to be.
 *
 * The quote form is no contact channel. The option `formulaireDevis` exists as on the old site,
 * where nothing turns it on, and it never counts among the conditions.
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

/** Length from which a description counts for Google (`indexable`) and for a profile that is not empty */
export const DESCRIPTION_MIN = 100

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

/** The four conditions of a publishable profile: visible in the search and on the site */
export interface PublishableConditions {
	/** A main picture */
	readonly photoPrincipale: boolean
	/** The public city is a commune, a postal code or a town abroad, not a country, a street nor a void value */
	readonly villeExploitable: boolean
	/** A speciality */
	readonly specialite: boolean
	/** One of the contact channels is filled; the quote form is none */
	readonly canalDeContact: boolean
}

/** What a publishable profile needs more to be indexed by Google (`indexable`) */
export interface Richness {
	/** A description of 100 characters at least, edge spaces ignored, runs of spaces counted once */
	readonly description: boolean
	/** The first amount read in the price of one offer is between 5 and 10 000 */
	readonly pricedOffer: boolean
	/** At least one photo in the gallery */
	readonly gallery: boolean
	/** An offer with a numeric price or a gallery photo: the second half of the indexing rule */
	readonly richContent: boolean
}

export interface Completeness {
	/** Criteria met, out of 13 */
	readonly score: number
	readonly sur: 13
	/** Missing criteria, in display order */
	readonly manquants: Criterion[]
	readonly actif: boolean
	/** The four conditions: visible in the search and on the site */
	readonly publiable: boolean
	/** Publishable and rich enough for Google: description of 100 characters and (a priced offer or a gallery photo) */
	readonly indexable: boolean
	/** Internal account of the team: never publishable */
	readonly interne: boolean
	readonly conditions: PublishableConditions
	readonly richness: Richness
	/** None of the four conditions, no priced offer, no description of 100 characters: the search does not list such a profile */
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

/** Values that say nothing, a country alone or a whole area: never a city. */
const NOT_A_CITY = new Set([
	'france',
	'fr',
	'toute la france',
	'toute la france entiere',
	'france entiere',
	'france metropolitaine',
	'partout',
	'partout en france',
	'partout dans le monde',
	'monde',
	'monde entier',
	'europe',
	'international',
	'dom tom',
	'dom-tom',
	'null',
	'undefined',
	'nan',
	'none',
	'n/a',
	'-',
	'--',
	'.',
	'..',
	'...',
	'?',
])

/** « Toute la France », « Toute l'Europe », « Partout… », « Monde… »: an area, not a place. */
const WHOLE_AREA = /^(?:toute?s?\s+(?:la\s+|l['’]\s*)?(?:france|europe)|partout|monde)\b/

/**
 * Usable city: the public place of the field (publicCity: the commune of a postal address,
 * « Annecy (74) », never its street) is a place, whatever its kind: a French commune, a postal
 * code alone, a town abroad. Refused: nothing, a value without meaning (« null », « - », « . »), a
 * country alone or a whole area (« France », « Europe », « Toute la France »), an address without a
 * commune nor a postal code (« 3 avenue X »), a text that starts with a number other than a postal
 * code (« 74 et alentours »). There is no limit of length or of words: real names are long
 * (« Pont de Montvert - Sud Mont Lozère »).
 */
export function usableCity(city: unknown): boolean {
	const v = normalize(publicCity(city))
	if (v === '' || NOT_A_CITY.has(v) || WHOLE_AREA.test(v)) return false
	// a postal code alone: 5 digits in France, 4 in Belgium or Switzerland
	if (/^\d{4,5}$/.test(v)) return true
	if (/^\d+,? /.test(v) && !/^\d{5}\b/.test(v)) return false
	return /[a-z]/.test(v) || /\b\d{5}\b/.test(v)
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

/** Which of the four conditions of a publishable profile a profile meets. */
export function publishableConditions(profil: ProfileFields | null | undefined): PublishableConditions {
	const p = profil ?? {}
	return {
		photoPrincipale: aMedia(p.main_picture),
		villeExploitable: usableCity(p.city),
		specialite: filled(p.speciality),
		canalDeContact: hasContactChannel(p.network),
	}
}

/** What a profile has beyond the publication: the parts of the indexing rule, and the gallery. */
export function richnessOf(profil: ProfileFields | null | undefined): Richness {
	const p = profil ?? {}
	const offers = isList(p.service_offers) ? p.service_offers : []
	const pricedOffer = offers.some(offre => numericPrice(offre?.price) !== null)
	const gallery = aMedia(p.image_gallery)
	return {
		description: descriptionLength(p.description) >= DESCRIPTION_MIN,
		pricedOffer,
		gallery,
		richContent: pricedOffer || gallery,
	}
}

/** True when a profile meets none of the four conditions and has neither a priced offer nor a description of 100 characters. */
const noneOf = (conditions: PublishableConditions, richness: Richness): boolean =>
	!(Object.values(conditions).some(Boolean) || richness.pricedOffer || richness.description)

/** True when a profile is entirely empty: the search does not list it. */
export function isFullyEmpty(profil: ProfileFields | null | undefined): boolean {
	return noneOf(publishableConditions(profil), richnessOf(profil))
}

/** The whole reading of a profile: score, missing criteria, conditions and flags. */
export function completeness(
	profil: ProfileFields | null | undefined,
	options: CompletenessOptions = {}
): Completeness {
	const p = profil ?? {}
	const conditions = publishableConditions(p)
	const richness = richnessOf(p)
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
		galerie: richness.gallery,
	}
	const missing = CRITERIA.filter(critere => !presents[critere])
	const internal = isInternal(p)
	const active = conditions.photoPrincipale && conditions.villeExploitable && conditions.specialite
	const contact = conditions.canalDeContact || options.formulaireDevis === true
	const publishable = active && contact && !internal
	return {
		score: CRITERIA.length - missing.length,
		sur: 13,
		manquants: missing,
		actif: active,
		publiable: publishable,
		indexable: publishable && richness.description && richness.richContent,
		interne: internal,
		conditions,
		richness,
		entierementVide: noneOf(conditions, richness),
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
