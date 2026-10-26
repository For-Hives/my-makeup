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
export const READ_TIMEOUT_MS = 8000

export type ReadOutcome<T> = { reussie: true; valeur: T } | { reussie: false }

export async function readWithoutBlocking<T>(
	lire: () => Promise<T>,
	delaiMs = READ_TIMEOUT_MS,
	what = 'de l’annuaire'
): Promise<ReadOutcome<T>> {
	let timer: ReturnType<typeof setTimeout> | undefined
	const timeout = new Promise<never>((_, rejeter) => {
		timer = setTimeout(() => rejeter(new Error('delai')), delaiMs)
	})
	try {
		return { reussie: true, valeur: await Promise.race([lire(), timeout]) }
	} catch (error) {
		console.error(`recherche : lecture ${what} impossible (${error instanceof Error ? error.name : 'erreur'})`)
		return { reussie: false }
	} finally {
		clearTimeout(timer)
	}
}
