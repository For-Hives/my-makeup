/**
 * The reader of a run: one request at a time, two per second at most, each with its time limit
 * (plan 02 §7.6, ticket 155). Every request goes through the guard (tests/probes/guard.ts).
 *
 * The pace counts from the start of a request to the start of the next one, for every request
 * of the run, the sitemap included: a probe never weighs on the site it reads.
 */

import type { GuardedReading } from './guard'

/** 500 ms between two starts: two requests per second at most. */
export const INTERVAL_MINIMAL_MS = 500

/** Longest wait for an answer, body included. */
export const READING_DELAY_MS = 15_000

/** The time of the run, given to the reader so that a test can stand in for it. */
export interface Clock {
	maintenant: () => number
	attendre: (ms: number) => Promise<void>
}

export const REAL_CLOCK: Clock = {
	maintenant: () => performance.now(),
	attendre: ms => new Promise(resolve => setTimeout(resolve, ms)),
}

/** The first answer to a GET, read whole. */
export interface Page {
	chemin: string
	statut: number
	/** The `Content-Type` header, or null. */
	type: string | null
	corps: string
	/** All the headers of the answer. */
	entetes: Headers
}

export interface Reader {
	/** Reads a path of the target. Calls made together are served one after the other. */
	lire: (chemin: string, entetes?: Record<string, string>) => Promise<Page>
	/** The start of each request, in the time of the clock, in order. */
	readonly departs: readonly number[]
}

/** Thrown when a page does not come back within its time limit. */
export class ReadTooLong extends Error {
	override name = 'LectureTropLongue'
}

export interface ReaderOptions {
	lecture: GuardedReading
	horloge?: Clock
	intervalleMs?: number
	delaiMs?: number
}

export function createReader({
	lecture,
	horloge = REAL_CLOCK,
	intervalleMs = INTERVAL_MINIMAL_MS,
	delaiMs = READING_DELAY_MS,
}: ReaderOptions): Reader {
	const starts: number[] = []
	// The tail of the queue: a request starts when the one before it has finished.
	let file: Promise<unknown> = Promise.resolve()

	const readNow = async (chemin: string, entetes?: Record<string, string>): Promise<Page> => {
		const precedent = starts.at(-1)
		if (precedent !== undefined) {
			// Again until the time has come: a timer may fire a fraction of a millisecond early.
			const rest = () => precedent + intervalleMs - horloge.maintenant()
			while (rest() > 0) await horloge.attendre(Math.ceil(rest()))
		}
		starts.push(horloge.maintenant())

		// A controller and a timer rather than AbortSignal.timeout, which MSW ignores in the tests.
		const abandon = new AbortController()
		const timer = setTimeout(() => abandon.abort(), delaiMs)
		try {
			const response = await lecture(chemin, { signal: abandon.signal, ...(entetes ? { headers: entetes } : {}) })
			const corps = await response.text()
			return {
				chemin,
				statut: response.status,
				type: response.headers.get('content-type'),
				corps,
				entetes: response.headers,
			}
		} catch (error) {
			if (abandon.signal.aborted) throw new ReadTooLong(`aucune réponse complète en ${Math.round(delaiMs / 1000)} s`)
			throw error
		} finally {
			clearTimeout(timer)
		}
	}

	return {
		departs: starts,
		lire(chemin, entetes) {
			const tour = file.then(() => readNow(chemin, entetes))
			file = tour.catch(() => undefined)
			return tour
		},
	}
}

/** The shortest gap between two starts, or null with fewer than two requests. */
export function shortestGap(departs: readonly number[]): number | null {
	let shortest: number | null = null
	for (let rank = 1; rank < departs.length; rank += 1) {
		const gap = (departs[rank] ?? 0) - (departs[rank - 1] ?? 0)
		if (shortest === null || gap < shortest) shortest = gap
	}
	return shortest
}
