/**
 * The count of the searches by day (issue 1002). Where the offer is missing: how many searches were
 * made, how many named a city, how many found nobody, and in which département.
 *
 * - Three facts and a closed list, nothing else: a city was typed or not, nobody was found or not, the
 *   département the search points at (a code of `DEPARTMENTS`, else `unknown`). The words, the city
 *   typed, the address of the visitor and any identifier never reach this module, the table or the log.
 * - One row for each day (Paris) and département. A search adds one to its row, atomically (`INSERT …
 *   ON CONFLICT`), so two searches at the same time are two.
 * - The browser asks for the count once for each search, by the same decision as the Umami event
 *   (src/lib/analytics/duplicate.ts): the other pages of the results and a click on « back » do not count
 *   again. A browser that opted out of the audience measure does not count either.
 * - Rows older than 400 days are deleted by a daily task (src/lib/tasks/search-counts.ts).
 *
 * Relative imports on purpose, like the rest of src/lib: the Payload CLI loads the collection.
 */

import type { Payload } from 'payload'
import { DEPARTMENTS } from '../departments'
import { parisDay } from '../weekly-stats'
import { readPlace } from './place'

export const SEARCH_COUNT_COLLECTION = 'search-counts'

/** How long a row is kept, in days: enough to compare a season with the one before. */
export const SEARCH_COUNT_RETENTION_DAYS = 400

/** The département of a search that points at none, or at several. */
export const UNKNOWN_DEPARTMENT = 'unknown'

export interface SearchCount {
	/** A city (or a département) was typed. */
	withCity: boolean
	/** The search found nobody to show. */
	noResult: boolean
	/** A code of `DEPARTMENTS`, or `unknown`. */
	department: string
}

const isDepartment = (valeur: unknown): valeur is string =>
	typeof valeur === 'string' &&
	(valeur === UNKNOWN_DEPARTMENT || (Object.hasOwn(DEPARTMENTS, valeur) && DEPARTMENTS[valeur] !== undefined))

/**
 * What the server takes of a request to count: exactly these three keys, two booleans and a code of the
 * list. Anything else (a text, another key, a code outside the list) is refused, not cleaned.
 */
export function readSearchCount(entree: unknown): SearchCount | undefined {
	if (typeof entree !== 'object' || entree === null || Array.isArray(entree)) return undefined
	const keys = Object.keys(entree).sort()
	if (keys.join() !== 'department,noResult,withCity') return undefined
	const { withCity, noResult, department } = entree as Record<string, unknown>
	if (typeof withCity !== 'boolean' || typeof noResult !== 'boolean' || !isDepartment(department)) return undefined
	return { withCity, noResult, department }
}

/**
 * The département a search points at: the one the city typed names (a code, a name, a postal code), or,
 * for a commune the official list knows, the one the list gives (`communeDepartment`). Two or none: `unknown`.
 * The result is a code of the list, never a piece of what was typed.
 */
export function departmentOfSearch(city: string, communeDepartment: string | null | undefined): string {
	const named = readPlace(city).departements
	if (named.length === 1 && named[0] !== undefined && isDepartment(named[0])) return named[0]
	if (named.length === 0 && isDepartment(communeDepartment) && communeDepartment !== UNKNOWN_DEPARTMENT)
		return communeDepartment
	return UNKNOWN_DEPARTMENT
}

/** The day a search is counted under: the day in Paris, `YYYY-MM-DD`. */
export const searchCountDay = (maintenant: Date): string => parisDay(maintenant)

/** The instant a day is stored at: midnight UTC of the Paris day (a `date` column holds an instant). */
export const searchCountInstant = (jour: string): string => `${jour}T00:00:00.000Z`

/** The date before which a row is purged, `maintenant` being the clock of the purge. */
export const searchCountPurgeThreshold = (maintenant: Date): Date => {
	const day = new Date(searchCountInstant(searchCountDay(maintenant)))
	return new Date(day.getTime() - SEARCH_COUNT_RETENTION_DAYS * 86_400_000)
}

/** Adds one search to the row of the day and département, creating the row on the first one. */
export async function recordSearchCount(
	payload: Pick<Payload, 'db'>,
	count: SearchCount,
	maintenant: Date = new Date()
): Promise<void> {
	await payload.db.pool.query(
		`INSERT INTO "search_counts" ("day", "department", "total", "with_city", "no_result")
		 VALUES ($1::timestamptz, $2, 1, $3, $4)
		 ON CONFLICT ("day", "department") DO UPDATE SET
		   "total" = "search_counts"."total" + 1,
		   "with_city" = "search_counts"."with_city" + EXCLUDED."with_city",
		   "no_result" = "search_counts"."no_result" + EXCLUDED."no_result"`,
		[searchCountInstant(searchCountDay(maintenant)), count.department, count.withCity ? 1 : 0, count.noResult ? 1 : 0]
	)
}
