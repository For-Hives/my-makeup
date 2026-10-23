/**
 * The filters and the sort of the search page (issue 1011): a ceiling on the starting price, and a sort.
 * Both come from the address, nothing else, and both are optional: an address without them, or with a value
 * this file does not know, is the search of before.
 *
 * - The price is the lowest amount the artist typed on her offers (`startingPrice` of her card). A profile
 *   with no amount (« Sur devis ») is not shown under a ceiling: it has no price to compare.
 * - The sort acts inside each section of the results, never across them, and before the rules that put the
 *   profiles with no way to be reached and with no zone last (src/lib/search/results.ts).
 * - The speciality filter is one of the bullets of issue 1010 (`specialty`, a value of src/lib/specialty.ts): the
 *   profiles that chose it. A profile whose speciality is only a free text (« Autre ») is not in it, and the page
 *   offers the bullets that at least one listed profile has. The word of the search still looks into every text.
 * - There is no filter on the availability: a profile marked unavailable is not listed, and no date exists.
 *
 * No `next` import: read by the page and by the tests.
 */

import { SPECIALTY_BULLETS, SPECIALTY_VALUES, type SpecialtyBullet } from '../specialty'
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
	/** Only the artists who chose this speciality bullet; none for all. */
	specialty: SpecialtyBullet | null
	/** Only the artists whose starting price is at most this, in euros; none for all. */
	maxPrice: number | null
	sort: SortKey
}

export const DEFAULT_FILTERS: SearchFilters = { specialty: null, maxPrice: null, sort: 'relevance' }

/** True when the address asks for something other than the search of before. */
export const filtersActive = ({ specialty, maxPrice, sort }: SearchFilters): boolean =>
	specialty !== null || maxPrice !== null || sort !== 'relevance'

/** The filters of an address (`searchParams` of the page). A value that is not on the lists is ignored. */
export function readFilters(parameters: Record<string, unknown> = {}): SearchFilters {
	const price = Number(field(parameters.maxPrice))
	const sort = field(parameters.sort)
	const specialty = field(parameters.specialty)
	return {
		specialty: (SPECIALTY_VALUES as readonly string[]).includes(specialty) ? (specialty as SpecialtyBullet) : null,
		maxPrice: (PRICE_CEILINGS as readonly number[]).includes(price) ? price : null,
		sort: (SORTS as readonly string[]).includes(sort) ? (sort as SortKey) : 'relevance',
	}
}

/** What the filters read of a profile. */
export interface Filterable {
	/** The speciality bullets she chose. */
	specialtyBullets?: readonly string[] | null
	/** The lowest amount of her offers, in euros. */
	startingPrice?: number | null
	/** When her profile was last saved, in milliseconds. */
	updatedAt?: number
}

/** The profiles that pass the speciality and the price filters; all of them without any. */
export function applyFilters<T extends Filterable>(profils: readonly T[], { specialty, maxPrice }: SearchFilters): T[] {
	return profils.filter(
		profil =>
			(specialty === null || (profil.specialtyBullets ?? []).includes(specialty)) &&
			(maxPrice === null || (profil.startingPrice != null && profil.startingPrice <= maxPrice))
	)
}

/** The speciality bullets at least one of these profiles chose, in the order of the list of bullets: what the page offers. */
export function offeredSpecialties(profils: readonly Filterable[]): { value: SpecialtyBullet; label: string }[] {
	const chosen = new Set(profils.flatMap(profil => profil.specialtyBullets ?? []))
	return SPECIALTY_BULLETS.filter(bullet => chosen.has(bullet.value)).map(({ value, label }) => ({ value, label }))
}

/** One section sorted: a stable sort, a profile with no value last, and the order it had breaks every tie. */
export function sortSection<T extends Filterable>(profils: readonly T[], { sort }: SearchFilters): T[] {
	if (sort === 'relevance') return [...profils]
	const worst = sort === 'price' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
	const key = (profil: T): number => (sort === 'price' ? profil.startingPrice : profil.updatedAt) ?? worst
	return profils.toSorted((a, b) => (sort === 'price' ? key(a) - key(b) : key(b) - key(a)) || 0)
}
