/**
 * The photos of the site, kept in the object storage (ticket 043; docs/migration/SCHEMA.md, §8).
 *
 * Each `media` document holds where its object is: its own prefix (the folder of the object, empty
 * at the root of the storage) and its file name. The object key is the prefix, then the file name;
 * the public address is the base of the photos, then that key. One rule for every document: a
 * photo sent in the v3 is under `media/`, a photo of the old site adopted where it is, at the root
 * or under its own prefix, keeps its address character for character (ticket 058).
 */

/** The prefix of every photo sent in the v3. The types, the size and the unpredictable name are those of ticket 133. */
export const PREFIXE_DES_ENVOIS = 'media'

/** The most photos a gallery holds (plan 02, U80). */
export const GALERIE_MAX = 10

/** The key of an object: its prefix (a folder, possibly nested, possibly empty), then its file name. */
export function cleDuMedia(prefixe: string | null | undefined, fichier: string): string {
	const dossiers = (prefixe ?? '').split('/').filter(segment => segment !== '')
	return [...dossiers, fichier].join('/')
}

/**
 * The public address of a photo: the base of the photos (`mediaBaseUrl`, src/lib/env.ts), then its
 * key. Each segment is encoded as a path segment, which leaves the names the storage gives (letters,
 * digits, `-`, `_`, `.`) as they are.
 */
export function adresseDuMedia(base: string, prefixe: string | null | undefined, fichier: string): string {
	const chemin = cleDuMedia(prefixe, fichier).split('/').map(encodeURIComponent).join('/')
	return `${base}/${chemin}`
}
