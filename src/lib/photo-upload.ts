/**
 * What a photo sent to the site may be (ticket 133; plan 01 §6.1, plan 02 U79, U80, U81): a JPEG,
 * a PNG or a WebP of 10 MiB at most, recognised by its first bytes, never by the type or the name
 * the sender declares. It is stored under a name the server draws, never the original one.
 *
 * Ported from the old API (api-my-makeup src/utils/upload-rules.js). Pure: no I/O.
 */

/** Largest photo the server takes (10 MiB, as the old API). */
export const PHOTO_SIZE_MAX = 10 * 1024 * 1024

/**
 * What a multipart body may weigh beyond the file itself: the boundaries, the `_payload` field and the
 * headers of its parts. The whole request is refused past `PHOTO_SIZE_MAX` plus this (ticket 273).
 */
export const MULTIPART_OVERHEAD_MAX = 1024 * 1024

/** Largest request body the site reads on a route that receives a file (ticket 273). */
export const UPLOAD_REQUEST_SIZE_MAX = PHOTO_SIZE_MAX + MULTIPART_OVERHEAD_MAX

/** The types accepted, and the extension each one is stored under. */
export const PHOTO_TYPES = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
} as const

export type PhotoType = keyof typeof PHOTO_TYPES

/** The messages of the old site, word for word (src/lib/photo.js, branch main). */
export const UPLOAD_MESSAGES = {
	taille: 'La photo dépasse 10 Mo : choisis-en une plus légère.',
	type: "La photo n'a pas été acceptée : choisis une photo JPEG, PNG ou WebP.",
} as const

/**
 * The limits Payload's multipart parser applies to every request (`upload` of the config, ticket 273).
 * It reads the body as a stream and stops at the first limit crossed, before the access rules run: a
 * file past `PHOTO_SIZE_MAX` answers 413 with the usual message, and no more than `UPLOAD_REQUEST_SIZE_MAX`
 * bytes of any request are read. Payload's defaults are 20 MiB for a file and 50 MiB for a request.
 */
export const PAYLOAD_UPLOAD_LIMITS = {
	limits: { fileSize: PHOTO_SIZE_MAX },
	requestSizeLimit: UPLOAD_REQUEST_SIZE_MAX,
	responseOnLimit: UPLOAD_MESSAGES.taille,
} as const

const startsWith = (octets: Uint8Array, signature: number[], decalage = 0): boolean =>
	octets.length >= decalage + signature.length && signature.every((octet, i) => octets[decalage + i] === octet)

const charCodes = (texte: string): number[] => [...texte].map(lettre => lettre.charCodeAt(0))

/** The type of a photo read in its first bytes, or nothing when it is not a JPEG, a PNG or a WebP. */
export function photoType(octets: Uint8Array): PhotoType | undefined {
	if (startsWith(octets, [0xff, 0xd8, 0xff])) return 'image/jpeg'
	if (startsWith(octets, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
	if (startsWith(octets, charCodes('RIFF')) && startsWith(octets, charCodes('WEBP'), 8)) return 'image/webp'
	return undefined
}

export type UploadVerdict = { accepte: true; type: PhotoType } | { accepte: false; message: string }

/** Whether a file may be stored: its size first, then the type its content shows. */
export function judge(octets: Uint8Array, taille = octets.length): UploadVerdict {
	if (taille > PHOTO_SIZE_MAX) return { accepte: false, message: UPLOAD_MESSAGES.taille }
	const type = photoType(octets)
	return type ? { accepte: true, type } : { accepte: false, message: UPLOAD_MESSAGES.type }
}

/** The name a stored photo gets: a random UUID and the extension of its real type. Nothing of the original name. */
export const unpredictableName = (type: PhotoType, uuid: string = crypto.randomUUID()): string =>
	`${uuid}.${PHOTO_TYPES[type]}`

/**
 * The context key by which server code, never a request, keeps the name of the file it gives: the
 * set of the test bench, whose photos have fixed names. `skipCloudStorage` (the import adopting a
 * photo where it is) keeps it as well. A request cannot set a context.
 */
export const NAMED_FILE_CONTEXT = 'fichierNomme'
