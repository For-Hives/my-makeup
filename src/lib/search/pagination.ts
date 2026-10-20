/**
 * The pages of the results (ticket 100; plan 02 U18, E41): 20 by page, every profile once. Ported
 * from `paginer` and `sectionsOfPage` of the old site (src/lib/recherche.js, branch main).
 *
 * The whole list is the sections one after the other: the profiles of the place typed, then the
 * others (src/lib/search/place.ts). A page is a slice of that list, so a profile is on one page
 * only, and a page that crosses two sections shows the end of the first and the start of the next,
 * each under its own heading.
 *
 * No `next` import: read by the page and by the tests.
 */

export const PER_PAGE = 20

export interface ResultPage<T> {
	elements: T[]
	/** 1-based, brought back within the pages. */
	page: number
	pages: number
	total: number
	/** Rank (1-based) of the first element of the page in the whole list. */
	premier: number
}

/** One page of a list: a page past the last is the last, and an empty list is one empty page. */
export function paginate<T>(liste: readonly T[], page: number, parPage = PER_PAGE): ResultPage<T> {
	const pages = Math.max(1, Math.ceil(liste.length / parPage))
	const current = Math.min(Math.max(1, Math.trunc(page) || 1), pages)
	const start = (current - 1) * parPage
	return {
		elements: liste.slice(start, start + parPage),
		page: current,
		pages,
		total: liste.length,
		premier: start + 1,
	}
}

/**
 * The part of each section on the page: the whole list is the sections one after the other, `longueurs`
 * their sizes in it. A section with nothing on this page gives an empty part.
 */
export function sectionsOfPage<T>(
	{ elements, premier }: Pick<ResultPage<T>, 'elements' | 'premier'>,
	longueurs: readonly number[]
): T[][] {
	let start = 0
	return longueurs.map(longueur => {
		const end = start + Math.max(0, longueur)
		const part = elements.slice(Math.max(0, start - (premier - 1)), Math.max(0, end - (premier - 1)))
		start = end
		return part
	})
}
