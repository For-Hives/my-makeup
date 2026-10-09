/**
 * Pictures an artist sends from her space (UI-03, plans/01 §3.2): the
 * profile picture and the portfolio.
 *
 * The API takes JPEG, PNG and WebP up to 10 MB, checked on the first bytes
 * (api-my-makeup src/utils/upload-rules.js): HEIC, AVIF, SVG, GIF or PDF are
 * refused there, so they are refused here first with a message she can act
 * on. Every accepted picture is then shrunk in the browser before it leaves:
 * 2000 px at most on its longest side, WebP (JPEG when the browser cannot
 * encode WebP), 1 MB at most. Re-encoding also drops the EXIF block, the GPS
 * position of a phone photo included.
 *
 * The decisions are pure functions. The browser work (read the first bytes,
 * decode, draw, encode) goes through ports, given by
 * `src/lib/photo-navigateur.js` in the page and by fakes in the tests.
 */

export const TYPES_ACCEPTES = ['image/jpeg', 'image/png', 'image/webp']

/** `accept` attribute of the file inputs */
export const ACCEPT = TYPES_ACCEPTES.join(',')

/** Largest file sent to the API, after compression */
export const TAILLE_MAX_ENVOI = 1024 * 1024

/** Largest picture taken before compression (a phone photo is far below) */
export const TAILLE_MAX_CHOIX = 25 * 1024 * 1024

/** Longest side, in pixels, of a sent picture */
export const COTE_MAX = 2000

/** Steps tried in turn until the encoded picture fits in TAILLE_MAX_ENVOI */
export const PALIERS = [
	{ echelle: 1, qualite: 0.82 },
	{ echelle: 1, qualite: 0.72 },
	{ echelle: 1, qualite: 0.62 },
	{ echelle: 1, qualite: 0.5 },
	{ echelle: 0.75, qualite: 0.62 },
	{ echelle: 0.75, qualite: 0.5 },
	{ echelle: 0.5, qualite: 0.6 },
	{ echelle: 0.5, qualite: 0.45 },
]

export const MESSAGES_PHOTO = {
	heic: 'Les photos HEIC (format des iPhone) ne sont pas acceptées. Choisis une photo JPEG, PNG ou WebP. Sur iPhone : Réglages › Appareil photo › Formats › « Le plus compatible ».',
	type: "Ce fichier n'est pas accepté : choisis une photo JPEG, PNG ou WebP.",
	taille: 'Cette photo pèse plus de 25 Mo : choisis-en une plus légère.',
	illisible:
		'Impossible de lire cette photo : choisis une autre photo JPEG, PNG ou WebP.',
	'trop-lourde':
		'Cette photo reste trop lourde même réduite : choisis-en une autre.',
	'refus-taille': 'La photo dépasse 10 Mo : choisis-en une plus légère.',
	'refus-type':
		"La photo n'a pas été acceptée : choisis une photo JPEG, PNG ou WebP.",
	'envoi-impossible':
		"L'envoi de la photo a échoué, rien n'a été enregistré : réessaie dans quelques minutes.",
	'limite-galerie':
		'Ton portfolio contient déjà 10 photos : retires-en une pour en ajouter une autre.',
}

const EXTENSIONS = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	jfif: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	heic: 'image/heic',
	heif: 'image/heif',
	avif: 'image/avif',
	gif: 'image/gif',
	svg: 'image/svg+xml',
	pdf: 'application/pdf',
}

const TYPES_HEIC = new Set(['image/heic', 'image/heif'])

/**
 * Media type guessed from a file name, for the browsers that give no type
 * (some give '' for a HEIC file).
 * @param {string} nom
 * @returns {string} '' when unknown
 */
export function typeDepuisNom(nom) {
	const extension = /\.([a-z0-9]+)$/i.exec(String(nom ?? ''))?.[1]
	return EXTENSIONS[extension?.toLowerCase()] ?? ''
}

const commencePar = (tete, octets, decalage = 0) =>
	tete.length >= decalage + octets.length &&
	octets.every((octet, i) => tete[decalage + i] === octet)

const ascii = texte => [...texte].map(c => c.charCodeAt(0))

/**
 * Real type of a picture read from its first 12 bytes: the three types the
 * API takes (same signatures as its upload guard), plus HEIC and AVIF to
 * name them in the message.
 * @param {Uint8Array|number[]} tete
 * @returns {string|null}
 */
export function typeImageDepuisOctets(tete) {
	if (!tete || typeof tete.length !== 'number') return null
	if (commencePar(tete, [0xff, 0xd8, 0xff])) return 'image/jpeg'
	if (commencePar(tete, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
		return 'image/png'
	if (commencePar(tete, ascii('RIFF')) && commencePar(tete, ascii('WEBP'), 8))
		return 'image/webp'
	// ISO BMFF: size (4 bytes), « ftyp », then the major brand
	if (commencePar(tete, ascii('ftyp'), 4)) {
		const marque = String.fromCharCode(...Array.from(tete).slice(8, 12))
		if (/^(avif|avis)$/.test(marque)) return 'image/avif'
		if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(marque))
			return 'image/heic'
	}
	return null
}

/**
 * Checks a picture before anything else happens to it.
 * @param {{name?: string, type?: string, size: number, tete?: Uint8Array}} fichier
 *   `tete`: its first bytes, when they could be read
 * @returns {{ok: true, type: string} | {ok: false, raison: 'type'|'taille', code: string, message: string}}
 */
export function verifierPhoto({ name, type, size, tete } = {}) {
	const refus = (raison, code) => ({
		ok: false,
		raison,
		code,
		message: MESSAGES_PHOTO[code],
	})
	const declare = String(type ?? '').toLowerCase() || typeDepuisNom(name)
	// the bytes, when read, win over the declared type and the name
	const reel = tete === undefined ? declare : typeImageDepuisOctets(tete)

	if (TYPES_HEIC.has(reel) || (reel === null && TYPES_HEIC.has(declare)))
		return refus('type', 'heic')
	if (!TYPES_ACCEPTES.includes(reel)) return refus('type', 'type')
	if (!Number.isFinite(size) || size <= 0) return refus('type', 'illisible')
	if (size > TAILLE_MAX_CHOIX) return refus('taille', 'taille')
	return { ok: true, type: reel }
}

/**
 * Size of the sent picture: the longest side brought down to `coteMax`,
 * never enlarged, the ratio kept.
 * @param {number} largeur
 * @param {number} hauteur
 * @param {number} [coteMax]
 * @returns {{largeur: number, hauteur: number}|null} null for invalid sizes
 */
export function dimensionsCibles(largeur, hauteur, coteMax = COTE_MAX) {
	if (
		!Number.isFinite(largeur) ||
		!Number.isFinite(hauteur) ||
		largeur <= 0 ||
		hauteur <= 0 ||
		!(coteMax > 0)
	)
		return null
	const echelle = Math.min(1, coteMax / Math.max(largeur, hauteur))
	return {
		largeur: Math.max(1, Math.round(largeur * echelle)),
		hauteur: Math.max(1, Math.round(hauteur * echelle)),
	}
}

/**
 * Encodes the picture step by step (PALIERS) until it fits in `tailleMax`.
 * WebP first; when the browser answers with another type (Safari before 17
 * gives PNG for an unknown type), JPEG for this step and the next ones.
 *
 * @param {object} options
 * @param {number} options.largeur - decoded size of the picture
 * @param {number} options.hauteur
 * @param {(cible: {largeur: number, hauteur: number, type: string, qualite: number}) => Promise<{size: number, type: string}>} options.encoder
 * @param {number} [options.tailleMax]
 * @param {number} [options.coteMax]
 * @returns {Promise<{ok: true, blob: object, largeur: number, hauteur: number, type: string, qualite: number, essais: number} | {ok: false, code: string, essais: number}>}
 */
export async function compresserPhoto({
	largeur,
	hauteur,
	encoder,
	tailleMax = TAILLE_MAX_ENVOI,
	coteMax = COTE_MAX,
}) {
	const base = dimensionsCibles(largeur, hauteur, coteMax)
	if (!base) return { ok: false, code: 'illisible', essais: 0 }

	let type = 'image/webp'
	let essais = 0
	for (const { echelle, qualite } of PALIERS) {
		const cible = {
			largeur: Math.max(1, Math.round(base.largeur * echelle)),
			hauteur: Math.max(1, Math.round(base.hauteur * echelle)),
			qualite,
		}
		essais++
		let blob = await encoder({ ...cible, type })
		if (blob && blob.type !== type && type === 'image/webp') {
			type = 'image/jpeg'
			essais++
			blob = await encoder({ ...cible, type })
		}
		if (!blob || blob.type !== type)
			return { ok: false, code: 'illisible', essais }
		if (blob.size <= tailleMax)
			return { ok: true, blob, ...cible, type, essais }
	}
	return { ok: false, code: 'trop-lourde', essais }
}

/**
 * Name of the sent file: the original name made safe (letters, digits and
 * dashes, 60 characters at most), with the extension of the sent type.
 * @param {string} nom
 * @param {string} type
 * @returns {string}
 */
export function nomPhoto(nom, type) {
	const base = String(nom ?? '')
		.replace(/\.[a-z0-9]{1,5}$/i, '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60)
		.replace(/-+$/, '')
	const extension = type === 'image/webp' ? 'webp' : 'jpg'
	return `${base || 'photo'}.${extension}`
}

/**
 * From the chosen file to the file to send: checks it, decodes it and
 * compresses it. Never throws.
 *
 * @param {{name: string, type: string, size: number}} fichier
 * @param {object} ports
 * @param {(fichier: object) => Promise<Uint8Array>} ports.lireTete - first bytes
 * @param {(fichier: object) => Promise<{largeur: number, hauteur: number, encoder: Function, liberer?: Function}>} ports.decoder
 * @param {(blob: object, nom: string, type: string) => object} ports.fabriquerFichier
 * @returns {Promise<{ok: true, fichier: object, largeur: number, hauteur: number, taille: number} | {ok: false, raison: string, code: string, message: string}>}
 */
export async function preparerPhoto(
	fichier,
	{ lireTete, decoder, fabriquerFichier }
) {
	const refus = (raison, code) => ({
		ok: false,
		raison,
		code,
		message: MESSAGES_PHOTO[code],
	})

	let tete
	try {
		tete = await lireTete(fichier)
	} catch {
		return refus('type', 'illisible')
	}
	const verification = verifierPhoto({ ...pick(fichier), tete })
	if (!verification.ok) return verification

	let image
	try {
		image = await decoder(fichier)
	} catch {
		return refus('type', 'illisible')
	}
	try {
		const resultat = await compresserPhoto({
			largeur: image.largeur,
			hauteur: image.hauteur,
			encoder: image.encoder,
		})
		if (!resultat.ok)
			return refus(
				resultat.code === 'trop-lourde' ? 'taille' : 'type',
				resultat.code
			)
		return {
			ok: true,
			fichier: fabriquerFichier(
				resultat.blob,
				nomPhoto(fichier.name, resultat.type),
				resultat.type
			),
			largeur: resultat.largeur,
			hauteur: resultat.hauteur,
			taille: resultat.blob.size,
		}
	} catch {
		return refus('type', 'illisible')
	} finally {
		image.liberer?.()
	}
}

const pick = ({ name, type, size }) => ({ name, type, size })

/**
 * Code of the message for a refused POST /api/upload.
 * @param {number} status - 0 when the API could not be reached
 * @returns {'refus-taille'|'refus-type'|'envoi-impossible'}
 */
export function codeRefusEnvoi(status) {
	if (status === 413) return 'refus-taille'
	if (status === 400 || status === 415) return 'refus-type'
	return 'envoi-impossible'
}

/**
 * `kind` of the `upload_error` event for a refused POST /api/upload (plans/04
 * event 15): the status only, never the file, its name or the API text.
 * @param {number} status - 0 when the API could not be reached
 * @returns {'size'|'type'|'server'}
 */
export function kindRefusEnvoi(status) {
	if (status === 413) return 'size'
	if (status === 400 || status === 415) return 'type'
	return 'server'
}

/** Most pictures of a portfolio (the API takes more, the page shows 10) */
export const MAX_PHOTOS_GALERIE = 10
