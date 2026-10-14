/**
 * What a photo sent to the site may be (ticket 133; plan 01 §6.1, plan 02 U79, U80, U81): a JPEG,
 * a PNG or a WebP of 10 MiB at most, recognised by its first bytes, never by the type or the name
 * the sender declares. It is stored under a name the server draws, never the original one.
 *
 * Ported from the old API (api-my-makeup src/utils/upload-rules.js). Pure: no I/O.
 */

/** Largest photo the server takes (10 MiB, as the old API). */
export const TAILLE_MAX_PHOTO = 10 * 1024 * 1024

/** The types accepted, and the extension each one is stored under. */
export const TYPES_DE_PHOTO = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
} as const

export type TypeDePhoto = keyof typeof TYPES_DE_PHOTO

/** The messages of the old site, word for word (src/lib/photo.js, branch main). */
export const MESSAGES_D_ENVOI = {
	taille: 'La photo dépasse 10 Mo : choisis-en une plus légère.',
	type: "La photo n'a pas été acceptée : choisis une photo JPEG, PNG ou WebP.",
} as const

const commencePar = (octets: Uint8Array, signature: number[], decalage = 0): boolean =>
	octets.length >= decalage + signature.length && signature.every((octet, i) => octets[decalage + i] === octet)

const ascii = (texte: string): number[] => [...texte].map(lettre => lettre.charCodeAt(0))

/** The type of a photo read in its first bytes, or nothing when it is not a JPEG, a PNG or a WebP. */
export function typeDeLaPhoto(octets: Uint8Array): TypeDePhoto | undefined {
	if (commencePar(octets, [0xff, 0xd8, 0xff])) return 'image/jpeg'
	if (commencePar(octets, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
	if (commencePar(octets, ascii('RIFF')) && commencePar(octets, ascii('WEBP'), 8)) return 'image/webp'
	return undefined
}

export type VerdictDEnvoi = { accepte: true; type: TypeDePhoto } | { accepte: false; message: string }

/** Whether a file may be stored: its size first, then the type its content shows. */
export function juger(octets: Uint8Array, taille = octets.length): VerdictDEnvoi {
	if (taille > TAILLE_MAX_PHOTO) return { accepte: false, message: MESSAGES_D_ENVOI.taille }
	const type = typeDeLaPhoto(octets)
	return type ? { accepte: true, type } : { accepte: false, message: MESSAGES_D_ENVOI.type }
}

/** The name a stored photo gets: a random UUID and the extension of its real type. Nothing of the original name. */
export const nomImprevisible = (type: TypeDePhoto, uuid: string = crypto.randomUUID()): string =>
	`${uuid}.${TYPES_DE_PHOTO[type]}`
