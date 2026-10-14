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

/** What the address asks for. */
export interface Recherche {
	/** What is looked for ('' when nothing). */
	search: string
	/** Where ('' when nowhere). */
	city: string
}

const premier = (valeur: unknown): unknown => (Array.isArray(valeur) ? valeur[0] : valeur)

/** A field as typed: trimmed, spaces merged, 100 characters at most. Anything but a text is ''. */
export function champ(valeur: unknown): string {
	const texte = premier(valeur)
	return typeof texte === 'string' ? texte.trim().replace(/\s+/g, ' ').slice(0, LONGUEUR_MAX_DE_LA_SAISIE) : ''
}

/** The search of an address (`searchParams` of the page, or the parameters of a URL). */
export function lireLaRecherche(parametres: Record<string, unknown> = {}): Recherche {
	return { search: champ(parametres.search), city: champ(parametres.city) }
}

/** False when there is nothing to look for (U19): no term and no city. */
export const rechercheValide = ({ search, city }: Recherche): boolean => search !== '' || city !== ''

/**
 * A search by city: a city, and no other term than the city itself (the form of the old site sent the
 * city as the term too), of a place the page can rank by (neither empty, nor « France »).
 */
export const rechercheParVille = ({ search, city }: Recherche): boolean =>
	city !== '' && (search === '' || search.toLowerCase() === city.toLowerCase()) && lieuUtilisable(city)

/** A place the page can rank by: neither empty nor « France ». */
export function lieuUtilisable(city: string): boolean {
	const lieu = lireLieu(city)
	return lieu.segments.length > 0 || lieu.departements.length > 0
}

/** The path of the search page for a search; empty fields are left out. */
export function urlPageRecherche({ search = '', city = '' }: Partial<Recherche> = {}): string {
	const parametres = new URLSearchParams()
	if (champ(search)) parametres.set('search', champ(search))
	if (champ(city)) parametres.set('city', champ(city))
	const texte = parametres.toString()
	return texte ? `/search?${texte}` : '/search'
}

/**
 * The title of the results: what was typed, quoted, never a claim on where the artists are. With a
 * city, `total` counts the profiles of that city or département only.
 * « 3 résultats pour « Annecy » », « Aucun résultat pour « zzqq » ».
 */
export function titreDesResultats({ search, city }: Recherche, total: number): string {
	const nombre = total === 0 ? 'Aucun résultat' : `${total} résultat${total > 1 ? 's' : ''}`
	const quoi = search && search.toLowerCase() !== city.toLowerCase() ? `« ${search} »` : ''
	const ou = city ? `« ${city} »` : ''
	return `${nombre} pour ${[quoi, ou].filter(Boolean).join(' à ')}`
}
