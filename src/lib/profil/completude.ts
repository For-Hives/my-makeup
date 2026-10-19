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
 * - `entierementVide` = none of the six conditions. A name alone leaves a profile entirely empty;
 *   one condition is enough not to be.
 *
 * The quote form is no contact channel. The option `formulaireDevis` exists as on the old site,
 * where nothing turns it on, and it never counts among the six conditions.
 *
 * The fields keep their names of the old site (ChampsDuProfil), so that the cases shared with it
 * (tests/unit/fixtures/completude-cas.json) run unchanged. A caller maps its own document to them.
 * A picture is an object or a list, never a bare id: the type refuses a number, and at run time a
 * number counts as no picture.
 *
 * No server code here: the artist's space runs the same function in the browser.
 */

// Relative imports on purpose: the collection `profils` calls this file at every save (ticket 044),
// and the collections are also loaded by the Payload CLI, outside of Next.
import { parsePrice } from '../prix'
import { villePublique } from './lieu-public'

/** The 13 criteria of the progress bar, in display order */
export const CRITERES = [
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

export type Critere = (typeof CRITERES)[number]

/** Contact channels of the `network` of a profile */
export const CANAUX = ['youtube', 'instagram', 'facebook', 'website', 'linkedin', 'phone', 'email'] as const

export type Canal = (typeof CANAUX)[number]

/** Length from which a description counts for a publishable profile */
export const DESCRIPTION_MIN = 200

/** One service offer: only its price, as typed, is read */
export interface OffreDuProfil {
	readonly price?: string | null
}

/** The contact channels of a profile, as typed */
export type ReseauxDuProfil = { readonly [C in Canal]?: string | null }

/**
 * What the rule reads of a profile, under the names of the old site.
 * `main_picture` and `image_gallery`: a media as the old API returns it (`{ data: … }`), a flat
 * object, or a list; never a bare id.
 */
export interface ChampsDuProfil {
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
	readonly service_offers?: readonly (OffreDuProfil | null)[] | null
	readonly network?: ReseauxDuProfil | null
	readonly language?: readonly unknown[] | null
}

export interface OptionsCompletude {
	/**
	 * The quote form is online on the profiles and counts as the contact channel of `publiable`.
	 * Off by default, and nothing turns it on: as on the old site today.
	 */
	readonly formulaireDevis?: boolean
}

/** The six conditions of a publishable profile */
export interface ConditionsPubliable {
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

export interface Completude {
	/** Criteria met, out of 13 */
	readonly score: number
	readonly sur: 13
	/** Missing criteria, in display order */
	readonly manquants: Critere[]
	readonly actif: boolean
	readonly publiable: boolean
	/** Internal account of the team: never publishable */
	readonly interne: boolean
	readonly conditions: ConditionsPubliable
	/** None of the six conditions: the search does not list such a profile */
	readonly entierementVide: boolean
}

const texte = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const rempli = (v: unknown): boolean => texte(v) !== ''
const estListe = (v: unknown): v is readonly unknown[] => Array.isArray(v)
const liste = (v: unknown): boolean => estListe(v) && v.length > 0

/** A media of the old API (`{ data: … }`) or flat: true when there is at least one picture. */
export function aMedia(v: unknown): boolean {
	if (v === null || v === undefined) return false
	if (estListe(v)) return v.length > 0
	if (typeof v === 'object') return 'data' in v ? aMedia(v.data) : true
	return false
}

/** Lower case, no accents, single spaces. */
export function normaliser(v: unknown): string {
	return texte(v)
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
}

const PAS_UNE_VILLE = new Set([
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
 * Usable city: the public place of the field (villePublique: the commune of a postal address,
 * « Annecy (74) », never its street) is a town or a postcode, not a country, not free text. An
 * address without a commune nor a postal code (« 3 avenue X ») is not usable, nor a text that
 * starts with a number other than a postal code (« 74 et alentours »).
 */
export function villeExploitable(city: unknown): boolean {
	const v = normaliser(villePublique(city))
	if (v === '' || PAS_UNE_VILLE.has(v)) return false
	if (/^\d+,? /.test(v) && !/^\d{5}\b/.test(v)) return false
	if (!(/[a-z]/.test(v) || /\b\d{5}\b/.test(v))) return false
	return v.split(' ').length <= 6
}

/**
 * First amount read in a text price (« à partir de 80 € », « 1 200 € »), or null (« Sur devis »,
 * out of 5 to 10 000). The reading itself is the single price rule of src/lib/prix.ts.
 */
export function prixNumerique(price: unknown): number | null {
	return parsePrice(price).priceFrom
}

/** Length of the description, leading and trailing spaces ignored, runs of spaces counted once. */
export function longueurDescription(description: unknown): number {
	return texte(description).replace(/\s+/g, ' ').length
}

/** Internal account of the team (speciality « CEO/CTO My Makeup »): never publishable. */
export function estInterne(profil: ChampsDuProfil | null | undefined): boolean {
	const s = normaliser(profil?.speciality)
	return /\b(ceo|cto)\b/.test(s) || /\bmy ?-?make ?-?up\b/.test(s)
}

/** True when one of the contact channels is filled. */
export function aCanalDeContact(network: ReseauxDuProfil | null | undefined): boolean {
	if (network === null || network === undefined) return false
	return CANAUX.some(canal => rempli(network[canal]))
}

/** Which of the six conditions of a publishable profile a profile meets. */
export function conditionsPubliable(profil: ChampsDuProfil | null | undefined): ConditionsPubliable {
	const p = profil ?? {}
	const offres = estListe(p.service_offers) ? p.service_offers : []
	return {
		photoPrincipale: aMedia(p.main_picture),
		villeExploitable: villeExploitable(p.city),
		specialite: rempli(p.speciality),
		offreChiffree: offres.some(offre => prixNumerique(offre?.price) !== null),
		descriptionLongue: longueurDescription(p.description) >= DESCRIPTION_MIN,
		canalDeContact: aCanalDeContact(p.network),
	}
}

const aucune = (conditions: ConditionsPubliable): boolean => !Object.values(conditions).some(Boolean)

/** True when a profile meets none of the six conditions. */
export function estEntierementVide(profil: ChampsDuProfil | null | undefined): boolean {
	return aucune(conditionsPubliable(profil))
}

/** The whole reading of a profile: score, missing criteria, conditions and flags. */
export function completude(profil: ChampsDuProfil | null | undefined, options: OptionsCompletude = {}): Completude {
	const p = profil ?? {}
	const conditions = conditionsPubliable(p)
	const presents: Record<Critere, boolean> = {
		nom: rempli(p.last_name) && rempli(p.first_name),
		specialite: conditions.specialite,
		nom_artiste: rempli(p.company_artist_name),
		ville: rempli(p.city),
		description: rempli(p.description),
		photo: conditions.photoPrincipale,
		competences: liste(p.skills),
		experiences: liste(p.experiences),
		formations: liste(p.courses),
		offres: liste(p.service_offers),
		reseaux: conditions.canalDeContact,
		langues: liste(p.language),
		galerie: aMedia(p.image_gallery),
	}
	const manquants = CRITERES.filter(critere => !presents[critere])
	const interne = estInterne(p)
	const actif = conditions.photoPrincipale && conditions.villeExploitable && conditions.specialite
	const contact = conditions.canalDeContact || options.formulaireDevis === true
	const publiable = actif && conditions.offreChiffree && conditions.descriptionLongue && contact && !interne
	return {
		score: CRITERES.length - manquants.length,
		sur: 13,
		manquants,
		actif,
		publiable,
		interne,
		conditions,
		entierementVide: aucune(conditions),
	}
}

/**
 * True when a save made the profile publishable: it was not before the save, and it is with what
 * the server stored. Never the other way round.
 */
export function devientPubliable(
	avant: ChampsDuProfil | null | undefined,
	apres: ChampsDuProfil | null | undefined,
	options: OptionsCompletude = {}
): boolean {
	return !completude(avant, options).publiable && completude(apres, options).publiable
}
