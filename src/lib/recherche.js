/**
 * The search page (UI-07, plans/01 §3.2): its URL is the only source of the
 * search (/search?search=…&city=…&page=…), shareable and prefilled; a city
 * alone is a search (the API before PR #370 needs a term: the city is sent
 * as the term too); one API call per search, the pages of 20 results are cut
 * in the browser.
 */

export const PAR_PAGE = 20
export const LONGUEUR_MAX = 100
/** Beyond, the page says the search failed (the API is cut off) */
export const DELAI_RECHERCHE_MS = 8000

const premier = v => (Array.isArray(v) ? v[0] : v)

const champ = v => {
	const t = premier(v)
	return typeof t === 'string'
		? t.trim().replace(/\s+/g, ' ').slice(0, LONGUEUR_MAX)
		: ''
}

/**
 * @typedef {object} Recherche
 * @property {string} search - what is looked for ('' when none)
 * @property {string} city - where ('' when none)
 * @property {number} page - 1-based
 */

/**
 * The search of the URL (router.query).
 * @param {Record<string, unknown>} [query]
 * @returns {Recherche}
 */
export function lireRecherche(query = {}) {
	const page = Number.parseInt(champ(query?.page), 10)
	return {
		search: champ(query?.search),
		city: champ(query?.city),
		page: Number.isFinite(page) && page >= 1 && page <= 1000 ? page : 1,
	}
}

/**
 * @param {Recherche} recherche
 * @returns {boolean} false when there is nothing to look for
 */
export const rechercheValide = ({ search, city }) => !!(search || city)

/**
 * Same search (term and city), whatever the page.
 * @param {Recherche} recherche
 * @returns {string}
 */
export const cleRecherche = ({ search, city }) =>
	`${search.toLowerCase()}|${city.toLowerCase()}`

/**
 * URL of the public search of the API, or null without term nor city.
 * @param {string} apiBase - NEXT_PUBLIC_API_URL
 * @param {Recherche} recherche
 * @returns {string|null}
 */
export function urlApiRecherche(apiBase, { search, city }) {
	if (!search && !city) return null
	const parametres = new URLSearchParams({ search: search || city })
	if (city) parametres.set('city', city)
	return `${String(apiBase ?? '').replace(/\/+$/, '')}/api/searching?${parametres}`
}

/**
 * Path of the search page for a search (empty fields and page 1 left out).
 * @param {Partial<Recherche>} recherche
 * @returns {string}
 */
export function urlPageRecherche({ search = '', city = '', page = 1 } = {}) {
	const parametres = new URLSearchParams()
	if (champ(search)) parametres.set('search', champ(search))
	if (champ(city)) parametres.set('city', champ(city))
	if (page > 1) parametres.set('page', String(page))
	const texte = parametres.toString()
	return texte ? `/search?${texte}` : '/search'
}

/**
 * One page of the results.
 * @template T
 * @param {T[]} resultats
 * @param {number} page - 1-based, brought back within the pages
 * @param {number} [parPage]
 * @returns {{elements: T[], page: number, pages: number, total: number, premier: number}}
 */
export function paginer(resultats, page, parPage = PAR_PAGE) {
	const liste = Array.isArray(resultats) ? resultats : []
	const pages = Math.max(1, Math.ceil(liste.length / parPage))
	const courante = Math.min(Math.max(1, page || 1), pages)
	const debut = (courante - 1) * parPage
	return {
		elements: liste.slice(debut, debut + parPage),
		page: courante,
		pages,
		total: liste.length,
		premier: debut + 1,
	}
}

/**
 * Profiles of the API answer (those with a username, the link of their
 * page), or null when it is not a list (an error).
 * @param {unknown} corps
 * @returns {object[]|null}
 */
export function resultatsRecherche(corps) {
	return Array.isArray(corps)
		? corps.filter(
				r =>
					r &&
					typeof r === 'object' &&
					typeof r.username === 'string' &&
					r.username.trim() !== ''
			)
		: null
}

/**
 * Title of the results: « 3 maquilleuses pour « mariage » à Annecy ».
 * @param {Recherche} recherche
 * @param {number} total
 * @returns {string}
 */
export function titreResultats({ search, city }, total) {
	const nombre =
		total === 0
			? 'Aucune maquilleuse'
			: `${total} maquilleuse${total > 1 ? 's' : ''}`
	const quoi =
		search && search.toLowerCase() !== city.toLowerCase()
			? ` pour « ${search} »`
			: ''
	const ou = city ? ` à ${city}` : ''
	return `${nombre}${quoi}${ou}`
}
