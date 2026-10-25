/**
 * What the search page shows for a search (ticket 295; audit UX improvements 3 and 21): the profiles in
 * their sections, the number the title counts, and, when nobody is near, the honest empty state instead of
 * the whole directory.
 *
 * No `next` import: read by the page and by the tests.
 */

import { countryByCode } from '../countries'
import { foreignCountryOf } from '../dashboard/foreign-cities'
import {
	applyFilters,
	DEFAULT_FILTERS,
	filtersActive,
	offeredSpecialties,
	type PriceBand,
	priceBands,
	type SearchFilters,
} from './filters'
import { resultsTitle, type Search, searchByCity } from './input'
import type { ProfilesByPlace } from './place'
import { readPlace, sectionsByPlace } from './place'
import type { ResolvedPlace } from './place-point'
import { farTravellers, find, type SearchableProfile } from './results'

export interface SearchView<T extends SearchableProfile> {
	/** The speciality bullets the filter offers: those at least one listed profile chose. */
	specialties: ReturnType<typeof offeredSpecialties>
	/** The budgets the filter offers, cut from the real starting prices of the whole directory (none with too few prices). */
	bands: PriceBand[]
	/** True when the filters left nobody although the search without them finds someone (issue 1011). */
	filteredOut: boolean
	/** What the search without its filters shows: what the measure counts, so that a filter is not a new search. */
	baselineTotal: number
	/** True when the profiles are ranked by distance from a point (ticket 294). */
	ranked: boolean
	/** The profiles in their sections. Without any profile for a city alone: no whole-directory tail. */
	places: ProfilesByPlace<T>
	/** The profiles shown, all pages. */
	total: number
	/** The h1. */
	title: string
	/** True when nobody is shown: the page then offers a way on. */
	empty: boolean
	/** The profiles that go far, shown under an empty search by city; none otherwise. */
	far: T[]
	/** The départements the city typed is in, read on the whole directory: the way on of an empty search. */
	departments: string[]
	/** True when the city typed is not a commune of France: only the countries are read for abroad. */
	foreignCity: boolean
	/** The name of the country of a big foreign city typed (« Suisse » for Genève), when it is known. */
	foreignCountry: string | null
}

/** « Personne n’est encore inscrite près de Lyon. » (ticket 295). */
export const nobodyNear = (city: string): string => `Personne n’est encore inscrite près de ${city}.`

/** A place the list of communes could not know and that names a city, not a département, a country or a code. */
function namesACity(city: string): boolean {
	const place = readPlace(city)
	return (
		place.postalCodes.length === 0 &&
		place.departements.length === 0 &&
		place.segments.some(segment => !segment.departement && !segment.large)
	)
}

/**
 * The view of a search. With a point (`place.genre === 'point'`) the profiles are ranked by distance;
 * otherwise by the name of the place, as before. A search by city alone that finds nobody near, ranked
 * or not, is an empty state: the others of the directory are not listed (audit UX improvement 21). A
 * search with a word keeps its title and its sections.
 */
export function buildSearchView<T extends SearchableProfile>(
	directory: readonly T[],
	query: Pick<Search, 'search' | 'city'>,
	place: ResolvedPlace,
	filters: SearchFilters = DEFAULT_FILTERS
): SearchView<T> {
	if (filtersActive(filters)) return buildFilteredView(directory, query, place, filters)
	const view = buildView(directory, query, place, DEFAULT_FILTERS)
	return {
		...view,
		specialties: offeredSpecialties(directory),
		bands: priceBands(directory),
		filteredOut: false,
		baselineTotal: view.total,
	}
}

/**
 * The view with filters (issue 1011): the directory under the price ceiling is searched like the whole one.
 * When that leaves nobody but the search without filters finds someone, the page says the filters did it,
 * never « Personne n’est encore inscrite près de … ».
 */
function buildFilteredView<T extends SearchableProfile>(
	directory: readonly T[],
	query: Pick<Search, 'search' | 'city'>,
	place: ResolvedPlace,
	filters: SearchFilters
): SearchView<T> {
	const baseline = buildView(directory, query, place, DEFAULT_FILTERS)
	const view = buildView(applyFilters(directory, filters), query, place, filters)
	const filteredOut = view.empty && !baseline.empty
	return {
		...view,
		specialties: offeredSpecialties(directory),
		bands: priceBands(directory),
		filteredOut,
		baselineTotal: baseline.total,
		...(filteredOut && { title: NO_MATCH_FOR_FILTERS, far: [], foreignCity: false, foreignCountry: null }),
	}
}

/** The h1 of a search the filters emptied. */
export const NO_MATCH_FOR_FILTERS = 'Aucune maquilleuse ne correspond à ces filtres'

function buildView<T extends SearchableProfile>(
	directory: readonly T[],
	query: Pick<Search, 'search' | 'city'>,
	place: ResolvedPlace,
	filters: SearchFilters
): Omit<SearchView<T>, 'filteredOut' | 'baselineTotal' | 'specialties' | 'bands'> {
	const origin = place.genre === 'point' ? { point: place.point, label: place.label } : null
	const found = find(directory, query, origin, filters)
	const ranked = found.localTitle !== undefined
	const byCityAlone = searchByCity(query)
	const noLocal = found.parLieu && found.locaux.length === 0
	const nobody = byCityAlone && noLocal && (!ranked || found.sections.every(section => section.cle === 'autres'))
	const places: ProfilesByPlace<T> = nobody ? { ...found, sections: [] } : found
	const shown = [...places.locaux, ...places.sections.flatMap(section => section.profils)]
	const empty = shown.length === 0
	const foreignCity = empty && byCityAlone && !ranked && place.genre === 'unknown' && namesACity(query.city)
	const country = foreignCity ? foreignCountryOf(query.city) : undefined
	return {
		ranked,
		places,
		total: shown.length,
		title:
			empty && byCityAlone
				? nobodyNear(query.city)
				: resultsTitle(query, ranked || !found.parLieu ? shown.length : found.locaux.length),
		empty,
		departments: query.city ? sectionsByPlace(directory, query.city).departements : [],
		far: empty && byCityAlone ? farTravellers(directory, origin) : [],
		foreignCity,
		foreignCountry: country ? (countryByCode(country)?.name ?? null) : null,
	}
}
