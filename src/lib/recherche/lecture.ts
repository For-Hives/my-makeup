/**
 * Reading the directory without ever leaving the visitor on a blank screen (ticket 100): a read that
 * fails, or that does not answer in time (a database that is cut off, not just refused), is an
 * « échec » the page says in words, with a way to try again.
 *
 * The delay is under the 10 seconds the ticket allows, so the message comes in time. The failure is
 * logged by its class only: the error may carry the query, and the text typed is never written down.
 *
 * No `next` import: read by the page and by the tests.
 */

/** How long a read may take before the page gives up and says so. */
export const DELAI_DE_LECTURE_MS = 8000

export type Lecture<T> = { reussie: true; valeur: T } | { reussie: false }

export async function lireSansBloquer<T>(lire: () => Promise<T>, delaiMs = DELAI_DE_LECTURE_MS): Promise<Lecture<T>> {
	let minuteur: ReturnType<typeof setTimeout> | undefined
	const delai = new Promise<never>((_, rejeter) => {
		minuteur = setTimeout(() => rejeter(new Error('delai')), delaiMs)
	})
	try {
		return { reussie: true, valeur: await Promise.race([lire(), delai]) }
	} catch (erreur) {
		console.error(`recherche : lecture de l’annuaire impossible (${erreur instanceof Error ? erreur.name : 'erreur'})`)
		return { reussie: false }
	} finally {
		clearTimeout(minuteur)
	}
}
