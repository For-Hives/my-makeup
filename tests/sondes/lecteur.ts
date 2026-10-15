/**
 * The reader of a run: one request at a time, two per second at most, each with its time limit
 * (plan 02 §7.6, ticket 155). Every request goes through the guard (tests/sondes/garde.ts).
 *
 * The pace counts from the start of a request to the start of the next one, for every request
 * of the run, the sitemap included: a probe never weighs on the site it reads.
 */

import type { LectureGardee } from './garde'

/** 500 ms between two starts: two requests per second at most. */
export const INTERVALLE_MINIMAL_MS = 500

/** Longest wait for an answer, body included. */
export const DELAI_D_UNE_LECTURE_MS = 15_000

/** The time of the run, given to the reader so that a test can stand in for it. */
export interface Horloge {
	maintenant: () => number
	attendre: (ms: number) => Promise<void>
}

export const HORLOGE_REELLE: Horloge = {
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

export interface Lecteur {
	/** Reads a path of the target. Calls made together are served one after the other. */
	lire: (chemin: string, entetes?: Record<string, string>) => Promise<Page>
	/** The start of each request, in the time of the clock, in order. */
	readonly departs: readonly number[]
}

/** Thrown when a page does not come back within its time limit. */
export class LectureTropLongue extends Error {
	override name = 'LectureTropLongue'
}

export interface OptionsDuLecteur {
	lecture: LectureGardee
	horloge?: Horloge
	intervalleMs?: number
	delaiMs?: number
}

export function creerLecteur({
	lecture,
	horloge = HORLOGE_REELLE,
	intervalleMs = INTERVALLE_MINIMAL_MS,
	delaiMs = DELAI_D_UNE_LECTURE_MS,
}: OptionsDuLecteur): Lecteur {
	const departs: number[] = []
	// The tail of the queue: a request starts when the one before it has finished.
	let file: Promise<unknown> = Promise.resolve()

	const lireMaintenant = async (chemin: string, entetes?: Record<string, string>): Promise<Page> => {
		const precedent = departs.at(-1)
		if (precedent !== undefined) {
			// Again until the time has come: a timer may fire a fraction of a millisecond early.
			const reste = () => precedent + intervalleMs - horloge.maintenant()
			while (reste() > 0) await horloge.attendre(Math.ceil(reste()))
		}
		departs.push(horloge.maintenant())

		// A controller and a timer rather than AbortSignal.timeout, which MSW ignores in the tests.
		const abandon = new AbortController()
		const minuteur = setTimeout(() => abandon.abort(), delaiMs)
		try {
			const reponse = await lecture(chemin, { signal: abandon.signal, ...(entetes ? { headers: entetes } : {}) })
			const corps = await reponse.text()
			return {
				chemin,
				statut: reponse.status,
				type: reponse.headers.get('content-type'),
				corps,
				entetes: reponse.headers,
			}
		} catch (erreur) {
			if (abandon.signal.aborted)
				throw new LectureTropLongue(`aucune réponse complète en ${Math.round(delaiMs / 1000)} s`)
			throw erreur
		} finally {
			clearTimeout(minuteur)
		}
	}

	return {
		departs,
		lire(chemin, entetes) {
			const tour = file.then(() => lireMaintenant(chemin, entetes))
			file = tour.catch(() => undefined)
			return tour
		},
	}
}

/** The shortest gap between two starts, or null with fewer than two requests. */
export function ecartLePlusCourt(departs: readonly number[]): number | null {
	let plusCourt: number | null = null
	for (let rang = 1; rang < departs.length; rang += 1) {
		const ecart = (departs[rang] ?? 0) - (departs[rang - 1] ?? 0)
		if (plusCourt === null || ecart < plusCourt) plusCourt = ecart
	}
	return plusCourt
}
