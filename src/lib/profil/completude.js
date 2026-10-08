/**
 * The single definition of a profile (plans/04 §2.4, plans/02 U01-U08), used
 * by the progress bar of the artist's space, the public profile page (meta
 * robots), the sitemap and the measure:
 *
 * - score out of 13: the 13 criteria of the progress bar, for display only;
 * - `actif` = main picture + usable city (of the public place: a postal
 *   address counts by its commune, lieu-public.js) + speciality;
 * - `publiable` = `actif` + at least one offer with a numeric price + a
 *   description of 200 characters at least + at least one contact channel
 *   (the quote form counts once it is online); an internal account is never
 *   publiable.
 *
 * Same rules as `plans/mesures/outil/src/completude.ts` (weekly report) and,
 * later, `src/lib/profil/completude.ts` of the v3: the cases of
 * tests/unit/fixtures/completude-cas.json describe all of them.
 */

import { villePublique } from './lieu-public.js'

/** The 13 criteria, in display order */
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
]

/** Contact channels of the `network` component */
export const CANAUX = [
	'youtube',
	'instagram',
	'facebook',
	'website',
	'linkedin',
	'phone',
	'email',
]

export const DESCRIPTION_MIN = 200

const texte = v => (typeof v === 'string' ? v.trim() : '')
const rempli = v => texte(v) !== ''
const liste = v => Array.isArray(v) && v.length > 0

/**
 * Strapi v4 media (`{ data: … }`) or flat (/api/me-makeup): true when there is
 * at least one picture.
 * @param {unknown} v
 * @returns {boolean}
 */
export function aMedia(v) {
	if (v === null || v === undefined) return false
	if (Array.isArray(v)) return v.length > 0
	if (typeof v === 'object') return 'data' in v ? aMedia(v.data) : true
	return false
}

/**
 * Lower case, no accents, single spaces.
 * @param {unknown} v
 * @returns {string}
 */
export function normaliser(v) {
	return texte(v)
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
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
 * Usable city: the public place of the field (villePublique: the commune of
 * a postal address, « Annecy (74) », never its street) is a town or a
 * postcode, not a country, not free text. An address without a commune nor
 * a postal code (« 3 avenue X ») is not usable.
 * @param {unknown} city
 * @returns {boolean}
 */
export function villeExploitable(city) {
	const v = normaliser(villePublique(city))
	if (v === '' || PAS_UNE_VILLE.has(v)) return false
	if (!/[a-z]/.test(v) && !/\b\d{5}\b/.test(v)) return false
	return v.split(' ').length <= 6
}

/**
 * First amount read in a text price (« à partir de 80 € », « 1 200 € »), or
 * null (« Sur devis », out of 5 to 10 000).
 * @param {unknown} price
 * @returns {number|null}
 */
export function prixNumerique(price) {
	const v = texte(price)
		.replace(/(\d)[\s  ](?=\d{3}\b)/g, '$1')
		.replace(',', '.')
	const m = /(\d+(?:\.\d+)?)/.exec(v)
	if (m === null) return null
	const montant = Number(m[1])
	return montant >= 5 && montant <= 10_000 ? montant : null
}

/**
 * Length of the description, leading and trailing spaces ignored, runs of
 * spaces counted once.
 * @param {unknown} description
 * @returns {number}
 */
export function longueurDescription(description) {
	return texte(description).replace(/\s+/g, ' ').length
}

/**
 * Internal account of the team (speciality « CEO/CTO My Makeup »): never
 * publiable.
 * @param {{speciality?: unknown}} profil
 * @returns {boolean}
 */
export function estInterne(profil) {
	const s = normaliser(profil?.speciality)
	return /\b(ceo|cto)\b/.test(s) || /\bmy ?-?make ?-?up\b/.test(s)
}

/**
 * @param {Record<string, unknown>|null|undefined} network
 * @returns {boolean}
 */
export function aCanalDeContact(network) {
	if (network === null || network === undefined) return false
	return CANAUX.some(canal => rempli(network[canal]))
}

/**
 * True when a list of the public API hid the email and the phone of this
 * profile (API PR #370: lists never carry them, the single profile query
 * does): its contact channels are then unknown, not missing.
 * @param {unknown} network
 * @returns {boolean}
 */
export function contactsMasques(network) {
	return (
		network !== null &&
		typeof network === 'object' &&
		!('email' in network) &&
		!('phone' in network)
	)
}

/**
 * @typedef {object} Completude
 * @property {number} score - criteria met, out of 13
 * @property {13} sur
 * @property {string[]} manquants - missing criteria, in display order
 * @property {boolean} actif
 * @property {boolean} publiable
 * @property {boolean} interne
 */

/**
 * @param {object} profil - attributes of a Strapi profile (content API, or
 * flat from /api/me-makeup)
 * @param {{formulaireDevis?: boolean}} [options] - formulaireDevis: the quote
 * form is online on the profiles (F3a), it counts as a contact channel
 * @returns {Completude}
 */
export function completude(profil, options = {}) {
	const p = profil ?? {}
	const presents = {
		nom: rempli(p.last_name) && rempli(p.first_name),
		specialite: rempli(p.speciality),
		nom_artiste: rempli(p.company_artist_name),
		ville: rempli(p.city),
		description: rempli(p.description),
		photo: aMedia(p.main_picture),
		competences: liste(p.skills),
		experiences: liste(p.experiences),
		formations: liste(p.courses),
		offres: liste(p.service_offers),
		reseaux: aCanalDeContact(p.network),
		langues: liste(p.language),
		galerie: aMedia(p.image_gallery),
	}
	const manquants = CRITERES.filter(c => !presents[c])
	const interne = estInterne(p)
	const actif =
		presents.photo && villeExploitable(p.city) && presents.specialite
	const offreChiffree = (
		Array.isArray(p.service_offers) ? p.service_offers : []
	).some(o => prixNumerique(o?.price) !== null)
	const contact = presents.reseaux || options.formulaireDevis === true
	const publiable =
		actif &&
		offreChiffree &&
		longueurDescription(p.description) >= DESCRIPTION_MIN &&
		contact &&
		!interne
	return {
		score: CRITERES.length - manquants.length,
		sur: 13,
		manquants,
		actif,
		publiable,
		interne,
	}
}
