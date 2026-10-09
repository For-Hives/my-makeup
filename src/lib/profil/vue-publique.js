/**
 * What a public profile page shows (UI-06, plans/01 §3.2), computed from the
 * props only, so the server HTML already holds the name (the only h1), the
 * city, the speciality, the description, the offers and the pictures, and
 * the browser renders the same thing:
 * - no « undefined », « null », « Invalid Date » nor « & km » whatever
 *   Strapi holds;
 * - empty sections hidden on the public page;
 * - pictures named « Réalisation de <nom> (n/N) »;
 * - the city as it may be published (villePublique): the commune of a
 *   postal address, never its street (UI-11).
 * Works on the content API shape (`{ data: { attributes } }` media) and on
 * the flat shape of /api/me-makeup (the artist's space shows the same views).
 */

import { formatZone } from '../format-zone.js'
import { villePublique } from './lieu-public.js'

const VIDES = new Set(['null', 'undefined'])

/**
 * Trimmed text, '' for anything else or for the words null and undefined.
 * @param {unknown} v
 * @returns {string}
 */
export function texte(v) {
	if (typeof v !== 'string') return ''
	const t = v.trim()
	return VIDES.has(t.toLowerCase()) ? '' : t
}

/**
 * Attributes of a content API entry (`{ id, attributes }`), or the object
 * itself when already flat.
 * @param {unknown} entree
 * @returns {Record<string, any>}
 */
export function attributs(entree) {
	if (!entree || typeof entree !== 'object') return {}
	return entree.attributes && typeof entree.attributes === 'object'
		? entree.attributes
		: entree
}

/**
 * @typedef {object} Copie - a copy resized by Strapi
 * @property {string} url
 * @property {number|null} taille - weight in KB, as Strapi gives it (size)
 */

/**
 * @typedef {object} Media
 * @property {string} url
 * @property {number|null} width
 * @property {number|null} height
 * @property {{large?: Copie, medium?: Copie, small?: Copie}} formats - the
 *   copies Strapi made (1000, 750 and 500 px), none when it made none
 */

const dimension = v => (Number.isFinite(v) && v > 0 ? v : null)

/** Copies of a Strapi file that can stand for the picture (not thumbnail) */
const COPIES = ['large', 'medium', 'small']

function copies(formats) {
	const resultat = {}
	if (!formats || typeof formats !== 'object') return resultat
	for (const nom of COPIES) {
		const url = texte(formats[nom]?.url)
		if (url)
			resultat[nom] = {
				url,
				taille: Number.isFinite(formats[nom].size) ? formats[nom].size : null,
			}
	}
	return resultat
}

/**
 * Pictures of a media field, flat: `{ data: [...] }`, `{ data: {...} }`, an
 * array or one file. Files without url are dropped.
 * @param {unknown} v
 * @returns {Media[]}
 */
export function medias(v) {
	if (v === null || v === undefined) return []
	if (Array.isArray(v)) return v.flatMap(medias)
	if (typeof v !== 'object') return []
	if ('data' in v) return medias(v.data)
	const fichier = attributs(v)
	const url = texte(fichier.url)
	if (!url) return []
	return [
		{
			url,
			width: dimension(fichier.width),
			height: dimension(fichier.height),
			formats: copies(fichier.formats),
		},
	]
}

/** @returns {Media|null} */
export const photoPrincipale = profil =>
	medias(attributs(profil).main_picture)[0] ?? null

/** @returns {Media[]} */
export const galerie = profil => medias(attributs(profil).image_gallery)

/**
 * Absolute URL of a Strapi file: R2 gives absolute URLs, the local provider
 * gives /uploads/… paths, served by the API.
 * @param {string} url
 * @param {string} [apiBase] - NEXT_PUBLIC_API_URL
 * @returns {string}
 */
export function urlMedia(url, apiBase = '') {
	const u = texte(url)
	if (!u) return ''
	if (/^https?:\/\//i.test(u)) return u
	if (u.startsWith('/') && !u.startsWith('//'))
		return `${texte(apiBase).replace(/\/+$/, '')}${u}`
	return ''
}

/**
 * « Prénom Nom », '' when one of them is missing.
 * @param {unknown} profil
 * @returns {string}
 */
export function nomComplet(profil) {
	const p = attributs(profil)
	return [texte(p.first_name), texte(p.last_name)].filter(Boolean).join(' ')
}

/**
 * Name of the h1 and of the titles: first and last name, else the company or
 * artist name, else a neutral label.
 * @param {unknown} profil
 * @returns {string}
 */
export function nomAffiche(profil) {
	return (
		nomComplet(profil) ||
		texte(attributs(profil).company_artist_name) ||
		'Maquilleuse professionnelle'
	)
}

/**
 * @param {string} nom
 * @param {number} n - 1-based
 * @param {number} total
 * @returns {string}
 */
export const altRealisation = (nom, n, total) =>
	`Réalisation de ${nom} (${n}/${total})`

/**
 * Zone of a profile as text (formatZone of its public city and radius).
 * @param {unknown} profil
 * @returns {string}
 */
export function zoneProfil(profil) {
	const p = attributs(profil)
	return formatZone({ city: villePublique(p.city), radius: p.action_radius })
}

/**
 * « janvier 2020 », read in UTC so the server and the browser agree; '' when
 * the date is empty or invalid.
 * @param {unknown} date
 * @returns {string}
 */
export function moisAnnee(date) {
	if (typeof date !== 'string' && !(date instanceof Date)) return ''
	if (typeof date === 'string' && date.trim() === '') return ''
	const d = new Date(date)
	if (Number.isNaN(d.getTime())) return ''
	return d.toLocaleDateString('fr-FR', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC',
	})
}

/**
 * « janvier 2020 - aujourd’hui », « janvier 2020 - mars 2022 », '' when the
 * start is unknown.
 * @param {{date_start?: unknown, date_end?: unknown}} experience
 * @returns {string}
 */
export function periode(experience) {
	const debut = moisAnnee(experience?.date_start)
	if (!debut) return ''
	return `${debut} - ${moisAnnee(experience?.date_end) || 'aujourd’hui'}`
}

/**
 * Non-empty lines of a text typed with line breaks, each as texte(): a line
 * « null » or « undefined » is empty too.
 * @param {unknown} v
 * @returns {string[]}
 */
export function lignes(v) {
	return typeof v === 'string' ? v.split('\n').map(texte).filter(Boolean) : []
}

const RESEAUX = {
	instagram: 'https://www.instagram.com/',
	facebook: 'https://www.facebook.com/',
	linkedin: 'https://www.linkedin.com/in/',
	youtube: 'https://www.youtube.com/@',
	website: null,
}

const DOMAINE_SEUL =
	/^(www\.)?(instagram|facebook|fb|linkedin|youtube)\.com$|^youtu\.be$/i

/**
 * Link of a social network or website as typed by the artist: an http(s)
 * URL as is, a bare domain with https://, « @pseudo » on the network itself;
 * null for anything else (never a javascript: or relative link).
 * @param {string} canal
 * @param {unknown} valeur
 * @returns {string|null}
 */
export function urlReseau(canal, valeur) {
	const v = texte(valeur)
	if (!v || /\s/.test(v)) return null
	let url = null
	if (/^https?:\/\//i.test(v)) url = v
	// « studio.fictif » is an Instagram account, « instagram.com/x » a link
	else if (RESEAUX[canal] && /^@?[\w.]{1,30}$/.test(v) && !DOMAINE_SEUL.test(v))
		url = RESEAUX[canal] + v.replace(/^@/, '')
	else if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(v)) url = `https://${v}`
	if (url === null) return null
	try {
		const parse = new URL(url)
		return ['http:', 'https:'].includes(parse.protocol)
			? parse.toString()
			: null
	} catch {
		return null
	}
}

/**
 * @typedef {object} Contact
 * @property {'instagram'|'facebook'|'linkedin'|'youtube'|'email'|'phone'|'website'} canal
 * @property {string} libelle - text of the link
 * @property {string|null} href
 */

const LIBELLES_CANAUX = {
	instagram: 'Instagram',
	facebook: 'Facebook',
	linkedin: 'LinkedIn',
	youtube: 'YouTube',
	email: 'Email',
	phone: 'Téléphone',
	website: 'Site internet',
}

/** Name of a channel, for the icons (alt) */
export const libelleCanal = canal => LIBELLES_CANAUX[canal] ?? ''

/**
 * The published contact channels, in the order of the page.
 * @param {unknown} network
 * @returns {Contact[]}
 */
export function contacts(network) {
	if (!network || typeof network !== 'object') return []
	const resultat = []
	for (const canal of [
		'instagram',
		'facebook',
		'linkedin',
		'youtube',
		'email',
		'phone',
		'website',
	]) {
		const valeur = texte(network[canal])
		if (!valeur) continue
		let href
		if (canal === 'email')
			href = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valeur)
				? `mailto:${valeur}`
				: null
		else if (canal === 'phone') {
			const numero = valeur.replace(/[^\d+]/g, '')
			href = numero.length >= 6 ? `tel:${numero}` : null
		} else href = urlReseau(canal, valeur)
		resultat.push({ canal, libelle: valeur, href })
	}
	return resultat
}

const liste = v => (Array.isArray(v) ? v.filter(Boolean) : [])

/** Offers with a name, with their options with a name */
export function offres(profil) {
	return liste(attributs(profil).service_offers)
		.filter(o => texte(o.name))
		.map(o => ({
			...o,
			options: liste(o.options).filter(option => texte(option.name)),
		}))
}

/**
 * Which sections of the public page have something to show.
 * @param {unknown} profil
 * @returns {Record<'localisation'|'reseaux'|'competences'|'langues'|'formations'|'description'|'portfolio'|'offres'|'experiences', boolean>}
 */
export function sectionsVisibles(profil) {
	const p = attributs(profil)
	return {
		localisation: villePublique(p.city) !== '',
		reseaux: contacts(p.network).length > 0,
		competences: liste(p.skills).some(s => texte(s.name)),
		langues: liste(p.language).some(l => texte(l.name)),
		formations: liste(p.courses).some(c => texte(c.diploma) || texte(c.school)),
		description: lignes(p.description).length > 0,
		portfolio: galerie(p).length > 0,
		offres: offres(p).length > 0,
		experiences: liste(p.experiences).some(
			e => texte(e.company) || texte(e.job_name)
		),
	}
}
