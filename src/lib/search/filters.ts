/**
 * The filters and the sort of the search page (issue 1011): a ceiling on the starting price, and a sort.
 * Both come from the address, nothing else, and both are optional: an address without them, or with a value
 * this file does not know, is the search of before.
 *
 * - The price is the lowest amount the artist typed on her offers (`startingPrice` of her card). A profile
 *   with no amount (« Sur devis ») is not shown under a ceiling: it has no price to compare.
 * - The sort acts inside each section of the results, never across them, and before the rules that put the
 *   profiles with no way to be reached and with no zone last (src/lib/search/results.ts).
 * - There is no filter on the speciality (it waits for the list of bullets of issue 1010: the word of the
 *   search already looks into it) and none on the availability (a profile marked unavailable is not listed).
 *
 * No `next` import: read by the page and by the tests.
 */

import { field } from './input'

/** The ceilings of the price filter, in euros. */
export const PRICE_CEILINGS = [50, 100, 150, 250] as const

/** The sorts: the order of before, the lowest starting price first, the most recently updated first. */
export const SORTS = ['relevance', 'price', 'recent'] as const
export type SortKey = (typeof SORTS)[number]

/** What the sort is called on the page. */
export const SORT_LABELS: Readonly<Record<SortKey, string>> = {
	relevance: 'Pertinence',
	price: 'Prix de départ le plus bas',
	recent: 'Mises à jour récemment',
}

export interface SearchFilters {
	/** Only the artists whose starting price is at most this, in euros; none for all. */
	maxPrice: number | null
	sort: SortKey
}

export const DEFAULT_FILTERS: SearchFilters = { maxPrice: null, sort: 'relevance' }

/** True when the address asks for something other than the search of before. */
export const filtersActive = ({ maxPrice, sort }: SearchFilters): boolean => maxPrice !== null || sort !== 'relevance'

/** The filters of an address (`searchParams` of the page). A value that is not on the lists is ignored. */
export function readFilters(parameters: Record<string, unknown> = {}): SearchFilters {
	const price = Number(field(parameters.maxPrice))
	const sort = field(parameters.sort)
	return {
		maxPrice: (PRICE_CEILINGS as readonly number[]).includes(price) ? price : null,
		sort: (SORTS as readonly string[]).includes(sort) ? (sort as SortKey) : 'relevance',
	}
}

/** What the filters read of a profile. */
export interface Filterable {
	/** The lowest amount of her offers, in euros. */
	startingPrice?: number | null
	/** When her profile was last saved, in milliseconds. */
	updatedAt?: number
}

/** The profiles under the price ceiling; all of them without one. */
export function filterByPrice<T extends Filterable>(profils: readonly T[], { maxPrice }: SearchFilters): T[] {
	if (maxPrice === null) return [...profils]
	return profils.filter(profil => profil.startingPrice != null && profil.startingPrice <= maxPrice)
}

/** One section sorted: a stable sort, a profile with no value last, and the order it had breaks every tie. */
export function sortSection<T extends Filterable>(profils: readonly T[], { sort }: SearchFilters): T[] {
	if (sort === 'relevance') return [...profils]
	const worst = sort === 'price' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
	const key = (profil: T): number => (sort === 'price' ? profil.startingPrice : profil.updatedAt) ?? worst
	return profils.toSorted((a, b) => (sort === 'price' ? key(a) - key(b) : key(b) - key(a)) || 0)
}
