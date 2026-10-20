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

import { lireLieu } from './lieu'

export const LONGUEUR_MAX_DE_LA_SAISIE = 100

/** The most pages an address may ask for: a page beyond the last is brought back to it, this only bounds the number read. */
export const PAGE_MAX = 1000

/** What the address asks for. */
export interface Recherche {
	/** What is looked for ('' when nothing). */
	search: string
	/** Where ('' when nowhere). */
	city: string
	/** The page of the results, 1-based (ticket 100; plan 02 U18). */
	page: number
}

const premier = (valeur: unknown): unknown => (Array.isArray(valeur) ? valeur[0] : valeur)

/** A field as typed: trimmed, spaces merged, 100 characters at most. Anything but a text is ''. */
export function champ(valeur: unknown): string {
	const texte = premier(valeur)
	return typeof texte === 'string' ? texte.trim().replace(/\s+/g, ' ').slice(0, LONGUEUR_MAX_DE_LA_SAISIE) : ''
}

/** The page of an address: a whole number from 1 to `PAGE_MAX`, else 1 (a text, a decimal, zero, a negative number). */
export function lireLaPage(valeur: unknown): number {
	const texte = champ(valeur)
	const page = /^\d{1,4}$/.test(texte) ? Number(texte) : 0
	return page >= 1 && page <= PAGE_MAX ? page : 1
}

/**
 * The search of an address (`searchParams` of the page, or the parameters of a URL). `specialite` says
 * what `search` says (the address table of the plan promises both): it is read when `search` is empty.
 * Any other parameter is ignored.
 */
export function lireLaRecherche(parametres: Record<string, unknown> = {}): Recherche {
	return {
		search: champ(parametres.search) || champ(parametres.specialite),
		city: champ(parametres.city),
		page: lireLaPage(parametres.page),
	}
}

/** False when there is nothing to look for (U19): no term and no city. */
export const rechercheValide = ({ search, city }: Pick<Recherche, 'search' | 'city'>): boolean =>
	search !== '' || city !== ''

/**
 * A search by a word, alone or with a city: a term that is not the city itself. The page of the results
 * ranks the profiles by how well they match it (src/lib/recherche/pertinence.ts).
 */
export const rechercheParMot = ({ search, city }: Pick<Recherche, 'search' | 'city'>): boolean =>
	search !== '' && !rechercheParVille({ search, city })

/**
 * A search by city: a city, and no other term than the city itself (the form of the old site sent the
 * city as the term too), of a place the page can rank by (neither empty, nor « France »).
 */
export const rechercheParVille = ({ search, city }: Pick<Recherche, 'search' | 'city'>): boolean =>
	city !== '' && (search === '' || search.toLowerCase() === city.toLowerCase()) && lieuUtilisable(city)

/** A place the page can rank by: neither empty nor « France ». */
export function lieuUtilisable(city: string): boolean {
	const lieu = lireLieu(city)
	return lieu.segments.length > 0 || lieu.departements.length > 0
}

/** The path of the search page for a search; empty fields and the first page are left out. */
export function urlPageRecherche({ search = '', city = '', page = 1 }: Partial<Recherche> = {}): string {
	const parametres = new URLSearchParams()
	if (champ(search)) parametres.set('search', champ(search))
	if (champ(city)) parametres.set('city', champ(city))
	if (page > 1) parametres.set('page', String(Math.min(Math.trunc(page), PAGE_MAX)))
	const texte = parametres.toString()
	return texte ? `/search?${texte}` : '/search'
}

/**
 * The title of the results: what was typed, quoted, never a claim on where the artists are. With a
 * city, `total` counts the profiles of that city or département only.
 * « 3 résultats pour « Annecy » », « Aucun résultat pour « zzqq » ».
 */
export function titreDesResultats({ search, city }: Pick<Recherche, 'search' | 'city'>, total: number): string {
	const nombre = total === 0 ? 'Aucun résultat' : `${total} résultat${total > 1 ? 's' : ''}`
	const quoi = search && search.toLowerCase() !== city.toLowerCase() ? `« ${search} »` : ''
	const ou = city ? `« ${city} »` : ''
	return `${nombre} pour ${[quoi, ou].filter(Boolean).join(' à ')}`
}
