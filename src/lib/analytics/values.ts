/**
 * The values of the events of ticket 145, drawn from what a page knows. Every function returns a
 * word of a closed list of the catalogue (events.ts), never a piece of what the visitor typed.
 */

import type { MyMakeupEvents } from './events'

/** The slice of results: the count is never sent, only the slice it falls in. */
export function resultBucket(nombre: number): MyMakeupEvents['search_submit']['results'] {
	if (nombre <= 0) return '0'
	if (nombre <= 5) return '1-5'
	if (nombre <= 20) return '6-20'
	return '21+'
}

/** What a 404 was looking for, from the first segment of its address. */
export function notFoundKind(chemin: string): MyMakeupEvents['not_found']['kind'] {
	const first = chemin.split(/[?#]/)[0]?.split('/')[1]?.toLowerCase()
	if (first === 'profil' || first === 'talent' || first === 'blog') return first
	return 'autre'
}

const CHUNK =
	/ChunkLoadError|Loading chunk|Loading CSS chunk|Failed to load chunk|Failed to fetch dynamically imported module/i

/** Why a page broke: a script that did not load (a new version went out), an error while drawing, or something else. */
export function errorCode(erreur: unknown): MyMakeupEvents['app_error']['code'] {
	if (!(erreur instanceof Error)) return 'unknown'
	if (CHUNK.test(erreur.name) || CHUNK.test(erreur.message)) return 'chunk_load'
	return 'render'
}
