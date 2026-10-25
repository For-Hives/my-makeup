/**
 * The filters and the sort of the search page (issue 1011): a budget (a floor and a ceiling on the starting
 * price), a speciality and a sort, and the layout of the results (list or grid). All come from the address,
 * nothing else, and all are optional: an address without them, or with a value this file does not know, is
 * the search of before.
 *
 * - The price is the lowest amount the artist typed on her offers (`startingPrice` of her card). A profile
 *   with no amount (« Sur devis ») is not shown under a floor or a ceiling: it has no price to compare.
 * - The address accepts any whole amount between the bounds of a price (PRICE_MIN, PRICE_MAX), so that a shared
 *   link keeps its meaning when the prices change. What the page *offers* (`priceBands`) is cut from the real
 *   starting prices of the directory: nothing is invented, and with too few prices nothing is offered.
 * - The sort acts inside each section of the results, never across them, and before the rules that put the
 *   profiles with no way to be reached and with no zone last (src/lib/search/results.ts).
 * - The speciality filter is one of the bullets of issue 1010 (`specialty`, a value of src/lib/specialty.ts): the
 *   profiles that chose it. A profile whose speciality is only a free text (« Autre ») is not in it, and the page
 *   offers the bullets that at least one listed profile has. The word of the search still looks into every text.
 * - There is no filter on the availability: a profile marked unavailable is not listed, and no date exists.
 *
 * No `next` import: read by the page and by the tests.
 */

import { PRICE_MAX, PRICE_MIN } from '../price'
import { SPECIALTY_BULLETS, SPECIALTY_VALUES, type SpecialtyBullet } from '../specialty'
import { field } from './input'

/** How the results are laid out: one card per row, or a grid of vertical cards. The list is the layout of before. */
export const LAYOUTS = ['list', 'grid'] as const
export type Layout = (typeof LAYOUTS)[number]

/** The layout of an address; anything else is the list. */
export function readLayout(parameters: Record<string, unknown> = {}): Layout {
	const layout = field(parameters.layout)
	return (LAYOUTS as readonly string[]).includes(layout) ? (layout as Layout) : 'list'
}

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
	/** Only the artists whose starting price is at least this, in euros; none for no floor. */
	minPrice: number | null
	/** Only the artists whose starting price is at most this, in euros; none for no ceiling. */
	maxPrice: number | null
	sort: SortKey
}

export const DEFAULT_FILTERS: SearchFilters = { specialty: null, minPrice: null, maxPrice: null, sort: 'relevance' }

/** True when the address asks for something other than the search of before. */
export const filtersActive = ({ specialty, minPrice, maxPrice, sort }: SearchFilters): boolean =>
	specialty !== null || minPrice !== null || maxPrice !== null || sort !== 'relevance'

/** A whole amount of euros between the bounds of a price, or none. */
function readAmount(value: unknown): number | null {
	const text = field(value)
	if (!/^\d{1,5}$/.test(text)) return null
	const amount = Number(text)
	return amount >= PRICE_MIN && amount <= PRICE_MAX ? amount : null
}

/** The filters of an address (`searchParams` of the page). A value that is not on the lists is ignored. */
export function readFilters(parameters: Record<string, unknown> = {}): SearchFilters {
	const sort = field(parameters.sort)
	const specialty = field(parameters.specialty)
	return {
		specialty: (SPECIALTY_VALUES as readonly string[]).includes(specialty) ? (specialty as SpecialtyBullet) : null,
		minPrice: readAmount(parameters.minPrice),
		maxPrice: readAmount(parameters.maxPrice),
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
export function applyFilters<T extends Filterable>(
	profils: readonly T[],
	{ specialty, minPrice, maxPrice }: SearchFilters
): T[] {
	return profils.filter(
		profil =>
			(specialty === null || (profil.specialtyBullets ?? []).includes(specialty)) &&
			((minPrice === null && maxPrice === null) ||
				(profil.startingPrice != null &&
					(minPrice === null || profil.startingPrice >= minPrice) &&
					(maxPrice === null || profil.startingPrice <= maxPrice)))
	)
}

/** A budget the page offers: a range of starting prices, cut from the real ones, with the profiles it holds. */
export interface PriceBand {
	/** Floor in euros, or none for « moins de ». */
	min: number | null
	/** Ceiling in euros, or none for « et plus ». */
	max: number | null
	label: string
	/** How many of the profiles read have a starting price in the band. */
	count: number
}

/** The fewest profiles with a starting price for the page to offer budgets: under it, a cut would be a guess. */
export const PRICE_BANDS_MINIMUM = 6

const NBSP = '\u00a0'

/**
 * The budgets the page offers, cut from the starting prices of the profiles read (never typed by hand): the lowest
 * price of the middle third and the lowest of the upper third are the two edges, rounded down to 10 € (5 € under 50 €),
 * so the bands hold about a third of the priced profiles each and do not overlap. Fewer than PRICE_BANDS_MINIMUM
 * priced profiles, or edges that split nobody (all the same price), give no band. A profile with no price is in none.
 */
export function priceBands(profils: readonly Filterable[]): PriceBand[] {
	const prices = profils
		.map(profil => profil.startingPrice)
		.filter((price): price is number => typeof price === 'number' && price >= PRICE_MIN && price <= PRICE_MAX)
		.toSorted((a, b) => a - b)
	if (prices.length < PRICE_BANDS_MINIMUM) return []
	const round = (price: number): number => (price >= 50 ? Math.floor(price / 10) * 10 : Math.floor(price / 5) * 5)
	const edges = [
		...new Set(
			[Math.floor(prices.length / 3), Math.floor((2 * prices.length) / 3)].map(i => round(prices[i] as number))
		),
	]
	const bands: PriceBand[] = []
	edges.forEach((edge, index) => {
		const min = index === 0 ? null : (edges[index - 1] as number)
		const max = edge - 1
		bands.push({ min, max, label: bandLabel(min, max), count: 0 })
	})
	const last = edges.at(-1) as number
	bands.push({ min: last, max: null, label: bandLabel(last, null), count: 0 })
	for (const band of bands)
		band.count = prices.filter(
			price => (band.min === null || price >= band.min) && (band.max === null || price <= band.max)
		).length
	return bands.filter(band => band.count > 0).length >= 2 && bands.every(band => band.count > 0) ? bands : []
}

/** « Moins de 70 € », « De 70 à 129 € », « 130 € et plus ». */
export function bandLabel(min: number | null, max: number | null): string {
	if (min === null && max !== null) return `Moins de ${max + 1}${NBSP}€`
	if (min !== null && max !== null) return `De ${min} à ${max}${NBSP}€`
	if (min !== null) return `${min}${NBSP}€ et plus`
	return 'Tous les budgets'
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
