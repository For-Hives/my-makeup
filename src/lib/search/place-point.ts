/**
 * Turns a place typed (a commune name, with or without hyphens and accents, or a postal code) into a
 * point on the map (ticket 293; audit UX §1 defect 3 and improvement 3). The point comes from the
 * official list of the communes the dashboard already uses (src/lib/dashboard/city-reference.ts).
 *
 * - Whatever goes wrong (the list is slow, down, or does not know the place) is one outcome,
 *   `unknown`, and nothing is thrown: the caller then keeps the search as it is today.
 * - The wait is short (`PLACE_DELAY_MS`), well under the delay of the list itself.
 * - A cache keeps the places found, bounded in size and in time. It holds a normalised place name and
 *   a point, never anything about a person, and never a failure.
 *
 * No `next` import: read by the page and by the tests.
 */

import { type CitiesSearch, findCities, type OfficialCity } from '../dashboard/city-reference'
import { normalizePlace } from '../departments'
import { type GeoPoint, validPoint } from './geo-distance'
import { readPlace } from './place'

/** How long the search waits for the list before it gives up on the place. */
export const PLACE_DELAY_MS = 1500

/** How many places the cache keeps at most. */
export const PLACE_CACHE_MAX = 500

/** How long a place found is kept. */
export const PLACE_CACHE_FOUND_MS = 24 * 60 * 60 * 1000

/** How long a place the list does not know is kept. */
export const PLACE_CACHE_UNKNOWN_MS = 60 * 60 * 1000

/**
 * The place resolved: a point and the name of the commune it is the centre of; or `unknown` (the list
 * answered and has no such commune: a foreign city, a typo, a département, a country); or `unavailable`
 * (the list was slow or down: nothing is known, ticket 295). Both leave the search as it was.
 */
export type ResolvedPlace =
	| { genre: 'point'; point: GeoPoint; label: string }
	| { genre: 'unknown' }
	| { genre: 'unavailable' }

const UNKNOWN: ResolvedPlace = { genre: 'unknown' }
const UNAVAILABLE: ResolvedPlace = { genre: 'unavailable' }

/** What the resolver needs from outside: the list, a clock, the limits. All have a default. */
export interface PlaceResolverOptions {
	findCities?: (text: string) => Promise<CitiesSearch>
	now?: () => number
	delayMs?: number
	maxEntries?: number
}

/** The part of what was typed that names one place: a postal code if there is one, else the first place written. */
function placeQuestion(typed: string): string {
	const code = /(?<!\d)\d{5}(?!\d)/.exec(typed)
	if (code) return code[0]
	return (typed.split(/[,;/|+()[\]]|\s[-–—]\s/)[0] ?? '').trim().replace(/\s+/g, ' ')
}

/** The key of a place in the cache: its name without accents, hyphens or case. */
export const placeKey = (question: string): string => normalizePlace(question)

/** The commune the list found for a question: the exact name if there is one, else the first with a centre. */
function chosenCity(
	question: string,
	communes: readonly OfficialCity[],
	typedDepartment: boolean
): OfficialCity | null {
	const withCenter = communes.filter(commune => validPoint(commune))
	if (/^\d{5}$/.test(question)) {
		// A postal code shared by several communes: the first, the most populated (the list is asked by population).
		return withCenter[0] ?? null
	}
	const wanted = placeKey(question)
	const exact = withCenter.find(commune => placeKey(commune.nom) === wanted)
	if (exact) return exact
	// « Savoie » is a département, and no commune: a nearby spelling is not guessed for it.
	return typedDepartment ? null : (withCenter[0] ?? null)
}

interface Entry {
	value: ResolvedPlace
	expires: number
}

/** A resolver with its own cache. */
export function createPlaceResolver(options: PlaceResolverOptions = {}): (typed: string) => Promise<ResolvedPlace> {
	const ask = options.findCities ?? findCities
	const now = options.now ?? Date.now
	const delay = options.delayMs ?? PLACE_DELAY_MS
	const maxEntries = options.maxEntries ?? PLACE_CACHE_MAX
	const cache = new Map<string, Entry>()

	function remember(key: string, value: ResolvedPlace): void {
		cache.delete(key)
		cache.set(key, {
			value,
			expires: now() + (value.genre === 'point' ? PLACE_CACHE_FOUND_MS : PLACE_CACHE_UNKNOWN_MS),
		})
		// The oldest entries go first (a Map keeps its insertion order).
		while (cache.size > maxEntries) {
			const oldest = cache.keys().next()
			if (oldest.done) break
			cache.delete(oldest.value)
		}
	}

	return async function resolvePlace(typed: string): Promise<ResolvedPlace> {
		try {
			const question = placeQuestion(typed)
			if (question === '') return UNKNOWN
			const place = readPlace(question)
			// « France », a country or a region is not a point.
			if (place.segments.length === 0 && place.departements.length === 0) return UNKNOWN
			if (place.segments.length > 0 && place.segments.every(segment => segment.large)) return UNKNOWN
			const key = placeKey(question)
			const hit = cache.get(key)
			if (hit && hit.expires > now()) return hit.value
			if (hit) cache.delete(key)

			let timer: ReturnType<typeof setTimeout> | undefined
			const timeout = new Promise<'timeout'>(resolve => {
				timer = setTimeout(() => resolve('timeout'), delay)
			})
			const answer = await Promise.race([ask(question), timeout]).finally(() => clearTimeout(timer))
			// Nothing is kept of a failure: the next search asks again.
			if (answer === 'timeout' || answer.genre === 'panne') return UNAVAILABLE
			if (answer.genre === 'rien') return UNKNOWN
			const typedDepartment = place.segments.some(segment => segment.departement)
			const city = chosenCity(question, answer.communes, typedDepartment)
			if (city === null || city.latitude === null || city.longitude === null) {
				remember(key, UNKNOWN)
				return UNKNOWN
			}
			const found: ResolvedPlace = {
				genre: 'point',
				point: { latitude: city.latitude, longitude: city.longitude },
				label: city.nom,
			}
			remember(key, found)
			return found
		} catch {
			return UNAVAILABLE
		}
	}
}

/** The resolver the pages use, with the cache of the process. */
export const resolvePlace = createPlaceResolver()
