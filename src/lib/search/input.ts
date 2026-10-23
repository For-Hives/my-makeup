/**
 * What the visitor typed (ticket 098; plan 02 U17 and U19): the search page reads its address and
 * nothing else (« L'adresse est la seule source de la recherche »). `/search?search=…&city=…`.
 *
 * Ported from src/lib/recherche.js of the old site (branch main), under the same rules: a field is
 * trimmed, its spaces merged and cut at 100 characters; an array (a repeated parameter) gives its
 * first value; a missing or empty field is ''. A search without a term and without a city is no
 * search: the page then says what to type, and never fails (U19).
 *
 * No `next` import: read by the page and by the tests.
 */

import type { SearchFilters } from './filters'
import { readPlace } from './place'

export const INPUT_MAX_LENGTH = 100

/** The most pages an address may ask for: a page beyond the last is brought back to it, this only bounds the number read. */
export const PAGE_MAX = 1000

/** What the address asks for. */
export interface Search {
	/** What is looked for ('' when nothing). */
	search: string
	/** Where ('' when nowhere). */
	city: string
	/** The page of the results, 1-based (ticket 100; plan 02 U18). */
	page: number
}

const first = (valeur: unknown): unknown => (Array.isArray(valeur) ? valeur[0] : valeur)

/** A field as typed: trimmed, spaces merged, 100 characters at most. Anything but a text is ''. */
export function field(valeur: unknown): string {
	const text = first(valeur)
	return typeof text === 'string' ? text.trim().replace(/\s+/g, ' ').slice(0, INPUT_MAX_LENGTH) : ''
}

/** The page of an address: a whole number from 1 to `PAGE_MAX`, else 1 (a text, a decimal, zero, a negative number). */
export function readPage(valeur: unknown): number {
	const text = field(valeur)
	const page = /^\d{1,4}$/.test(text) ? Number(text) : 0
	return page >= 1 && page <= PAGE_MAX ? page : 1
}

/**
 * The search of an address (`searchParams` of the page, or the parameters of a URL). `specialite` says
 * what `search` says (the address table of the plan promises both): it is read when `search` is empty.
 * Any other parameter is ignored.
 */
export function readSearch(parametres: Record<string, unknown> = {}): Search {
	return {
		search: field(parametres.search) || field(parametres.specialite),
		city: field(parametres.city),
		page: readPage(parametres.page),
	}
}

/** False when there is nothing to look for (U19): no term and no city. */
export const validSearch = ({ search, city }: Pick<Search, 'search' | 'city'>): boolean => search !== '' || city !== ''

/**
 * A search by a word, alone or with a city: a term that is not the city itself. The page of the results
 * ranks the profiles by how well they match it (src/lib/search/relevance.ts).
 */
export const searchByWord = ({ search, city }: Pick<Search, 'search' | 'city'>): boolean =>
	search !== '' && !searchByCity({ search, city })

/**
 * A search by city: a city, and no other term than the city itself (the form of the old site sent the
 * city as the term too), of a place the page can rank by (neither empty, nor « France »).
 */
export const searchByCity = ({ search, city }: Pick<Search, 'search' | 'city'>): boolean =>
	city !== '' && (search === '' || search.toLowerCase() === city.toLowerCase()) && usablePlace(city)

/** A place the page can rank by: neither empty nor « France ». */
export function usablePlace(city: string): boolean {
	const place = readPlace(city)
	return place.segments.length > 0 || place.departements.length > 0
}

/** The path of the search page for a search; empty fields, the first page and the default filters are left out. */
export function searchPageUrl({
	search = '',
	city = '',
	page = 1,
	specialty = null,
	maxPrice = null,
	sort = 'relevance',
}: Partial<Search> & Partial<SearchFilters> = {}): string {
	const params = new URLSearchParams()
	if (field(search)) params.set('search', field(search))
	if (field(city)) params.set('city', field(city))
	if (specialty !== null) params.set('specialty', specialty)
	if (maxPrice !== null) params.set('maxPrice', String(maxPrice))
	if (sort !== 'relevance') params.set('sort', sort)
	if (page > 1) params.set('page', String(Math.min(Math.trunc(page), PAGE_MAX)))
	const text = params.toString()
	return text ? `/search?${text}` : '/search'
}

/**
 * The title of the results: what was typed, quoted, never a claim on where the artists are. With a
 * city, `total` counts the profiles of that city or département only.
 * « 3 résultats pour « Annecy » », « Aucun résultat pour « zzqq » ».
 */
export function resultsTitle({ search, city }: Pick<Search, 'search' | 'city'>, total: number): string {
	const count = total === 0 ? 'Aucun résultat' : `${total} résultat${total > 1 ? 's' : ''}`
	const what = search && search.toLowerCase() !== city.toLowerCase() ? `« ${search} »` : ''
	const where = city ? `« ${city} »` : ''
	return `${count} pour ${[what, where].filter(Boolean).join(' à ')}`
}
