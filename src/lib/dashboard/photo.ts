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

export const TYPES_ACCEPTES = ['image/jpeg', 'image/png', 'image/webp'] as const

/** The `accept` attribute of the file inputs. */
export const ACCEPT = TYPES_ACCEPTES.join(',')

/** The largest file sent to the server, after the reduction (1 MiB). */
export const TAILLE_MAX_ENVOI = 1024 * 1024

/** The largest picture taken before the reduction (a phone photo is far below). */
export const TAILLE_MAX_CHOIX = 25 * 1024 * 1024

/** The longest side, in pixels, of a sent picture. */
export const COTE_MAX = 2000

/** The steps tried in turn until the encoded picture fits in `TAILLE_MAX_ENVOI`. */
export const PALIERS = [
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

export type CodeDePhoto = keyof typeof MESSAGES_PHOTO

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
export function typeDepuisNom(nom: string | undefined): string {
	const extension = /\.([a-z0-9]+)$/i.exec(nom ?? '')?.[1]
	return (extension && EXTENSIONS[extension.toLowerCase()]) || ''
}

const commencePar = (tete: ArrayLike<number>, octets: readonly number[], decalage = 0): boolean =>
	tete.length >= decalage + octets.length && octets.every((octet, i) => tete[decalage + i] === octet)

const ascii = (texte: string): number[] => [...texte].map(lettre => lettre.charCodeAt(0))

/** The real type of a picture, read in its first bytes. HEIC and AVIF are named to be refused by name. */
export function typeImageDepuisOctets(tete: ArrayLike<number>): string | null {
	if (commencePar(tete, [0xff, 0xd8, 0xff])) return 'image/jpeg'
	if (commencePar(tete, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
	if (commencePar(tete, ascii('RIFF')) && commencePar(tete, ascii('WEBP'), 8)) return 'image/webp'
	// ISO BMFF: a size (4 bytes), « ftyp », then the major brand.
	if (commencePar(tete, ascii('ftyp'), 4)) {
		const marque = String.fromCharCode(...Array.from(tete).slice(8, 12))
		if (/^(avif|avis)$/.test(marque)) return 'image/avif'
		if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(marque)) return 'image/heic'
	}
	return null
}

export interface FichierChoisi {
	name: string
	type: string
	size: number
}

export type RefusDePhoto = { ok: false; raison: 'type' | 'taille'; code: CodeDePhoto; message: string }

const refus = (raison: 'type' | 'taille', code: CodeDePhoto): RefusDePhoto => ({
	ok: false,
	raison,
	code,
	message: MESSAGES_PHOTO[code],
})

/** Checks a picture before anything else happens to it. `tete`: its first bytes, when they could be read. */
export function verifierPhoto({
	name,
	type,
	size,
	tete,
}: Partial<FichierChoisi> & { tete?: ArrayLike<number> }): { ok: true; type: string } | RefusDePhoto {
	const declare = (type ?? '').toLowerCase() || typeDepuisNom(name)
	// The bytes, when read, win over the declared type and the name.
	const reel = tete === undefined ? declare : typeImageDepuisOctets(tete)
	if (TYPES_HEIC.has(reel) || (reel === null && TYPES_HEIC.has(declare))) return refus('type', 'heic')
	if (reel === null || !(TYPES_ACCEPTES as readonly string[]).includes(reel)) return refus('type', 'type')
	if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) return refus('type', 'illisible')
	if (size > TAILLE_MAX_CHOIX) return refus('taille', 'taille')
	return { ok: true, type: reel }
}

/** The size of the sent picture: the longest side brought down to `coteMax`, never enlarged. */
export function dimensionsCibles(
	largeur: number,
	hauteur: number,
	coteMax: number = COTE_MAX
): { largeur: number; hauteur: number } | null {
	if (!(Number.isFinite(largeur) && Number.isFinite(hauteur)) || largeur <= 0 || hauteur <= 0 || !(coteMax > 0))
		return null
	const echelle = Math.min(1, coteMax / Math.max(largeur, hauteur))
	return {
		largeur: Math.max(1, Math.round(largeur * echelle)),
		hauteur: Math.max(1, Math.round(hauteur * echelle)),
	}
}

export interface CibleDEncodage {
	largeur: number
	hauteur: number
	type: string
	qualite: number
}

export type Encodeur = (cible: CibleDEncodage) => Promise<Blob>

/**
 * Encodes the picture step by step (`PALIERS`) until it fits in `tailleMax`. WebP first; when the
 * browser answers with another type (Safari before 17 gives PNG for a type it cannot encode), JPEG
 * for this step and the next ones.
 */
export async function compresserPhoto({
	largeur,
	hauteur,
	encoder,
	tailleMax = TAILLE_MAX_ENVOI,
	coteMax = COTE_MAX,
}: {
	largeur: number
	hauteur: number
	encoder: Encodeur
	tailleMax?: number
	coteMax?: number
}): Promise<
	| { ok: true; blob: Blob; largeur: number; hauteur: number; type: string; qualite: number; essais: number }
	| { ok: false; code: 'illisible' | 'trop-lourde'; essais: number }
> {
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
		if (!blob || blob.type !== type) return { ok: false, code: 'illisible', essais }
		if (blob.size <= tailleMax) return { ok: true, blob, ...cible, type, essais }
	}
	return { ok: false, code: 'trop-lourde', essais }
}

/** The name of the sent file: the original made safe (letters, digits, dashes), with the extension of the sent type. */
export function nomPhoto(nom: string | undefined, type: string): string {
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
export interface ImageDecodee {
	largeur: number
	hauteur: number
	encoder: Encodeur
	liberer?: () => void
}

/** The browser work, given by `photo-navigateur.ts` in the page and by fakes in a test. */
export interface PortsDePhoto<Fichier extends FichierChoisi, Produit> {
	lireTete: (fichier: Fichier) => Promise<Uint8Array>
	decoder: (fichier: Fichier) => Promise<ImageDecodee>
	fabriquerFichier: (blob: Blob, nom: string, type: string) => Produit
}

export type PhotoPreparee<Produit> =
	| { ok: true; fichier: Produit; largeur: number; hauteur: number; taille: number }
	| RefusDePhoto

/** From the chosen file to the file to send: checks it, decodes it, shrinks it. Never throws. */
export async function preparerPhoto<Fichier extends FichierChoisi, Produit>(
	fichier: Fichier,
	{ lireTete, decoder, fabriquerFichier }: PortsDePhoto<Fichier, Produit>
): Promise<PhotoPreparee<Produit>> {
	let tete: Uint8Array
	try {
		tete = await lireTete(fichier)
	} catch {
		return refus('type', 'illisible')
	}
	const verification = verifierPhoto({ name: fichier.name, type: fichier.type, size: fichier.size, tete })
	if (!verification.ok) return verification
	let image: ImageDecodee
	try {
		image = await decoder(fichier)
	} catch {
		return refus('type', 'illisible')
	}
	try {
		const resultat = await compresserPhoto({ largeur: image.largeur, hauteur: image.hauteur, encoder: image.encoder })
		if (!resultat.ok) return refus(resultat.code === 'trop-lourde' ? 'taille' : 'type', resultat.code)
		return {
			ok: true,
			fichier: fabriquerFichier(resultat.blob, nomPhoto(fichier.name, resultat.type), resultat.type),
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
