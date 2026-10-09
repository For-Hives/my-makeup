/**
 * Every entry of a Strapi list, page after page (SEO-10): the API answers
 * 25 entries by default and 100 at most (config/api.js), which is how the
 * old sitemap only listed 25 profiles out of 100.
 */

export const TAILLE_PAGE = 100
/** Beyond, something is wrong: an error rather than a silently cut list */
export const PAGES_MAX = 50

/**
 * Query of one page: pagination[page] and pagination[pageSize] added to the
 * path, which may already have a query string.
 * @param {string} requete - e.g. /api/talents?fields[0]=slug
 * @param {number} page - 1-based
 * @param {number} [taille]
 * @returns {string}
 */
export function avecPage(requete, page, taille = TAILLE_PAGE) {
	const separateur = requete.includes('?') ? '&' : '?'
	return `${requete}${separateur}pagination[page]=${page}&pagination[pageSize]=${taille}`
}

/**
 * @param {(page: number) => Promise<{data?: unknown[], meta?: {pagination?: {pageCount?: number}}}>} chargerPage
 * @param {{pagesMax?: number}} [options]
 * @returns {Promise<unknown[]>} the entries of every page, in order
 */
export async function toutesLesPages(chargerPage, { pagesMax = PAGES_MAX } = {}) {
	const entrees = []
	for (let page = 1; page <= pagesMax; page++) {
		// biome-ignore lint/performance/noAwaitInLoops: Each iteration depends on the preceding result; concurrency would change behavior.
		const reponse = await chargerPage(page)
		const data = Array.isArray(reponse?.data) ? reponse.data : []
		entrees.push(...data)
		const pages = Number(reponse?.meta?.pagination?.pageCount)
		if (!Number.isFinite(pages) || page >= pages || data.length === 0) return entrees
	}
	throw new Error(`liste Strapi de plus de ${pagesMax} pages`)
}
