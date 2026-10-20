/**
 * The pictures she sends from her space (tickets 134 and 135; plan 01 §3.3 P7.5; plan 02 U79, U80,
 * E36): the main photo and the portfolio. Ported from the old site (src/lib/photo.js, branch main).
 *
 * The server takes a JPEG, a PNG or a WebP of 10 MiB at most, read in its first bytes
 * (`src/lib/envoi-photo.ts`). A HEIC, an AVIF, a SVG, a GIF or a PDF is refused here first, with a
 * message she can act on. Every accepted picture is then shrunk in the browser before it leaves:
 * 2 000 px on its longest side, WebP (JPEG when the browser cannot encode WebP), 1 MiB at most.
 * Re-encoding also drops the EXIF block, the GPS position of a phone photo included.
 *
 * The decisions are pure functions. The browser work (read the first bytes, decode, draw, encode)
 * goes through ports: `photo-navigateur.ts` gives them in the page, a test gives fakes.
 */

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/** The `accept` attribute of the file inputs. */
export const ACCEPT = ACCEPTED_TYPES.join(',')

/** The largest file sent to the server, after the reduction (1 MiB). */
export const UPLOAD_SIZE_MAX = 1024 * 1024

/** The largest picture taken before the reduction (a phone photo is far below). */
export const CHOICE_SIZE_MAX = 25 * 1024 * 1024

/** The longest side, in pixels, of a sent picture. */
export const SIDE_MAX = 2000

/** The steps tried in turn until the encoded picture fits in `TAILLE_MAX_ENVOI`. */
export const LADDER = [
	{ echelle: 1, qualite: 0.82 },
	{ echelle: 1, qualite: 0.72 },
	{ echelle: 1, qualite: 0.62 },
	{ echelle: 1, qualite: 0.5 },
	{ echelle: 0.75, qualite: 0.62 },
	{ echelle: 0.75, qualite: 0.5 },
	{ echelle: 0.5, qualite: 0.6 },
	{ echelle: 0.5, qualite: 0.45 },
] as const

/** The messages of the old site, word for word (src/lib/photo.js, branch main). */
export const MESSAGES_PHOTO = {
	heic: 'Les photos HEIC (format des iPhone) ne sont pas acceptées. Choisis une photo JPEG, PNG ou WebP. Sur iPhone : Réglages › Appareil photo › Formats › « Le plus compatible ».',
	type: "Ce fichier n'est pas accepté : choisis une photo JPEG, PNG ou WebP.",
	taille: 'Cette photo pèse plus de 25 Mo : choisis-en une plus légère.',
	illisible: 'Impossible de lire cette photo : choisis une autre photo JPEG, PNG ou WebP.',
	'trop-lourde': 'Cette photo reste trop lourde même réduite : choisis-en une autre.',
	'refus-taille': 'La photo dépasse 10 Mo : choisis-en une plus légère.',
	'refus-type': "La photo n'a pas été acceptée : choisis une photo JPEG, PNG ou WebP.",
	'envoi-impossible': "L'envoi de la photo a échoué, rien n'a été enregistré : réessaie dans quelques minutes.",
	'limite-galerie': 'Ton portfolio contient déjà 10 photos : retires-en une pour en ajouter une autre.',
	doublon: 'Cette photo est déjà dans ta liste : choisis-en une autre.',
} as const

export type PhotoCode = keyof typeof MESSAGES_PHOTO

const EXTENSIONS: Readonly<Record<string, string>> = {
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

const TYPES_HEIC = new Set<string | null>(['image/heic', 'image/heif'])

/** The media type guessed from a file name, for the browsers that give none. Empty when unknown. */
export function typeFromName(nom: string | undefined): string {
	const extension = /\.([a-z0-9]+)$/i.exec(nom ?? '')?.[1]
	return (extension && EXTENSIONS[extension.toLowerCase()]) || ''
}

const startsWith = (tete: ArrayLike<number>, octets: readonly number[], decalage = 0): boolean =>
	tete.length >= decalage + octets.length && octets.every((octet, i) => tete[decalage + i] === octet)

const charCodes = (texte: string): number[] => [...texte].map(lettre => lettre.charCodeAt(0))

/** The real type of a picture, read in its first bytes. HEIC and AVIF are named to be refused by name. */
export function imageTypeFromBytes(tete: ArrayLike<number>): string | null {
	if (startsWith(tete, [0xff, 0xd8, 0xff])) return 'image/jpeg'
	if (startsWith(tete, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
	if (startsWith(tete, charCodes('RIFF')) && startsWith(tete, charCodes('WEBP'), 8)) return 'image/webp'
	// ISO BMFF: a size (4 bytes), « ftyp », then the major brand.
	if (startsWith(tete, charCodes('ftyp'), 4)) {
		const marker = String.fromCharCode(...Array.from(tete).slice(8, 12))
		if (/^(avif|avis)$/.test(marker)) return 'image/avif'
		if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(marker)) return 'image/heic'
	}
	return null
}

export interface ChosenFile {
	name: string
	type: string
	size: number
}

export type PhotoRefusal = { ok: false; raison: 'type' | 'taille'; code: PhotoCode; message: string }

const refusal = (raison: 'type' | 'taille', code: PhotoCode): PhotoRefusal => ({
	ok: false,
	raison,
	code,
	message: MESSAGES_PHOTO[code],
})

/** Checks a picture before anything else happens to it. `tete`: its first bytes, when they could be read. */
export function checkPhoto({
	name,
	type,
	size,
	tete: head,
}: Partial<ChosenFile> & { tete?: ArrayLike<number> }): { ok: true; type: string } | PhotoRefusal {
	const declare = (type ?? '').toLowerCase() || typeFromName(name)
	// The bytes, when read, win over the declared type and the name.
	const actual = head === undefined ? declare : imageTypeFromBytes(head)
	if (TYPES_HEIC.has(actual) || (actual === null && TYPES_HEIC.has(declare))) return refusal('type', 'heic')
	if (actual === null || !(ACCEPTED_TYPES as readonly string[]).includes(actual)) return refusal('type', 'type')
	if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) return refusal('type', 'illisible')
	if (size > CHOICE_SIZE_MAX) return refusal('taille', 'taille')
	return { ok: true, type: actual }
}

/** The size of the sent picture: the longest side brought down to `coteMax`, never enlarged. */
export function targetDimensions(
	largeur: number,
	hauteur: number,
	coteMax: number = SIDE_MAX
): { largeur: number; hauteur: number } | null {
	if (!(Number.isFinite(largeur) && Number.isFinite(hauteur)) || largeur <= 0 || hauteur <= 0 || !(coteMax > 0))
		return null
	const scale = Math.min(1, coteMax / Math.max(largeur, hauteur))
	return {
		largeur: Math.max(1, Math.round(largeur * scale)),
		hauteur: Math.max(1, Math.round(hauteur * scale)),
	}
}

export interface EncodingTarget {
	largeur: number
	hauteur: number
	type: string
	qualite: number
}

export type Encoder = (cible: EncodingTarget) => Promise<Blob>

/**
 * Encodes the picture step by step (`PALIERS`) until it fits in `tailleMax`. WebP first; when the
 * browser answers with another type (Safari before 17 gives PNG for a type it cannot encode), JPEG
 * for this step and the next ones.
 */
export async function compressPhoto({
	largeur,
	hauteur,
	encoder,
	tailleMax = UPLOAD_SIZE_MAX,
	coteMax = SIDE_MAX,
}: {
	largeur: number
	hauteur: number
	encoder: Encoder
	tailleMax?: number
	coteMax?: number
}): Promise<
	| { ok: true; blob: Blob; largeur: number; hauteur: number; type: string; qualite: number; essais: number }
	| { ok: false; code: 'illisible' | 'trop-lourde'; essais: number }
> {
	const base = targetDimensions(largeur, hauteur, coteMax)
	if (!base) return { ok: false, code: 'illisible', essais: 0 }
	let type = 'image/webp'
	let attempts = 0
	for (const { echelle: scale, qualite: quality } of LADDER) {
		const target = {
			largeur: Math.max(1, Math.round(base.largeur * scale)),
			hauteur: Math.max(1, Math.round(base.hauteur * scale)),
			qualite: quality,
		}
		attempts++
		let blob = await encoder({ ...target, type })
		if (blob && blob.type !== type && type === 'image/webp') {
			type = 'image/jpeg'
			attempts++
			blob = await encoder({ ...target, type })
		}
		if (!blob || blob.type !== type) return { ok: false, code: 'illisible', essais: attempts }
		if (blob.size <= tailleMax) return { ok: true, blob, ...target, type, essais: attempts }
	}
	return { ok: false, code: 'trop-lourde', essais: attempts }
}

/** The name of the sent file: the original made safe (letters, digits, dashes), with the extension of the sent type. */
export function photoName(nom: string | undefined, type: string): string {
	const base = (nom ?? '')
		.replace(/\.[a-z0-9]{1,5}$/i, '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60)
		.replace(/-+$/, '')
	return `${base || 'photo'}.${type === 'image/webp' ? 'webp' : 'jpg'}`
}

/** What the browser gives of a decoded picture. */
export interface DecodedImage {
	largeur: number
	hauteur: number
	encoder: Encoder
	liberer?: () => void
}

/** The browser work, given by `photo-navigateur.ts` in the page and by fakes in a test. */
export interface PhotoPorts<Fichier extends ChosenFile, Produit> {
	lireTete: (fichier: Fichier) => Promise<Uint8Array>
	decoder: (fichier: Fichier) => Promise<DecodedImage>
	fabriquerFichier: (blob: Blob, nom: string, type: string) => Produit
}

export type PreparedPhoto<Produit> =
	| { ok: true; fichier: Produit; largeur: number; hauteur: number; taille: number }
	| PhotoRefusal

/** From the chosen file to the file to send: checks it, decodes it, shrinks it. Never throws. */
export async function preparePhoto<Fichier extends ChosenFile, Produit>(
	fichier: Fichier,
	{ lireTete, decoder, fabriquerFichier }: PhotoPorts<Fichier, Produit>
): Promise<PreparedPhoto<Produit>> {
	let head: Uint8Array
	try {
		head = await lireTete(fichier)
	} catch {
		return refusal('type', 'illisible')
	}
	const verification = checkPhoto({ name: fichier.name, type: fichier.type, size: fichier.size, tete: head })
	if (!verification.ok) return verification
	let image: DecodedImage
	try {
		image = await decoder(fichier)
	} catch {
		return refusal('type', 'illisible')
	}
	try {
		const result = await compressPhoto({ largeur: image.largeur, hauteur: image.hauteur, encoder: image.encoder })
		if (!result.ok) return refusal(result.code === 'trop-lourde' ? 'taille' : 'type', result.code)
		return {
			ok: true,
			fichier: fabriquerFichier(result.blob, photoName(fichier.name, result.type), result.type),
			largeur: result.largeur,
			hauteur: result.hauteur,
			taille: result.blob.size,
		}
	} catch {
		return refusal('type', 'illisible')
	} finally {
		image.liberer?.()
	}
}
