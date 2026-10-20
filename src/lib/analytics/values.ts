/**
 * The values of the events of ticket 145, drawn from what a page knows. Every function returns a
 * word of a closed list of the catalogue (events.ts), never a piece of what the visitor typed.
 */

import type { EvenementsMyMakeup } from './events'

/** The slice of results: the count is never sent, only the slice it falls in. */
export function trancheDeResultats(nombre: number): EvenementsMyMakeup['search_submit']['results'] {
	if (nombre <= 0) return '0'
	if (nombre <= 5) return '1-5'
	if (nombre <= 20) return '6-20'
	return '21+'
}

/** What a 404 was looking for, from the first segment of its address. */
export function genreDePageIntrouvable(chemin: string): EvenementsMyMakeup['not_found']['kind'] {
	const premier = chemin.split(/[?#]/)[0]?.split('/')[1]?.toLowerCase()
	if (premier === 'profil' || premier === 'talent' || premier === 'blog') return premier
	return 'autre'
}

const CHUNK =
	/ChunkLoadError|Loading chunk|Loading CSS chunk|Failed to load chunk|Failed to fetch dynamically imported module/i

/** Why a page broke: a script that did not load (a new version went out), an error while drawing, or something else. */
export function codeDErreur(erreur: unknown): EvenementsMyMakeup['app_error']['code'] {
	if (!(erreur instanceof Error)) return 'unknown'
	if (CHUNK.test(erreur.name) || CHUNK.test(erreur.message)) return 'chunk_load'
	return 'render'
}
