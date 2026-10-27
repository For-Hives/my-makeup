/**
 * The values of the events of ticket 145, drawn from what a page knows. Every function returns a
 * word of a closed list of the catalogue (events.ts), never a piece of what the visitor typed.
 */

import { looksLikePersonalData, type MyMakeupEvents } from './events'

/** The slice of results: the count is never sent, only the slice it falls in. */
export function resultBucket(nombre: number): MyMakeupEvents['search_submit']['results'] {
	if (nombre <= 0) return '0'
	if (nombre <= 5) return '1-5'
	if (nombre <= 20) return '6-20'
	return '21+'
}

/** What a 404 was looking for, from the first segment of its address. */
export function notFoundKind(pathname: string): MyMakeupEvents['not_found']['kind'] {
	const first = pathname.split(/[?#]/)[0]?.split('/')[1]?.toLowerCase()
	if (first === 'profil' || first === 'talent' || first === 'blog') return first
	return 'autre'
}

const CHUNK =
	/ChunkLoadError|Loading chunk|Loading CSS chunk|Failed to load chunk|Failed to fetch dynamically imported module/i

/** Why a page broke: a script that did not load (a new version went out), an error while drawing, or something else. */
export function errorCode(erreur: unknown): MyMakeupEvents['app_error']['code'] {
	if (!(erreur instanceof Error)) return 'unknown'
	if (CHUNK.test(erreur.name) || CHUNK.test(erreur.message)) return 'chunk_load'
	return 'render'
}

/* ------------------------------------------------------------------------------------------
 * The addresses and the origins of the funnels (27/10/2026).
 * ---------------------------------------------------------------------------------------- */

/** The segments of an address, without its query and its hash. */
function bareSegments(pathname: string): string[] {
	return (pathname.split(/[?#]/)[0] ?? '').split('/').filter(segment => segment !== '')
}

/** The pages whose second segment is a name: the route is the pattern, never the name. */
const NAMED: Readonly<Record<string, string>> = {
	profil: '/profil/[slug]',
	talent: '/talent/[slug]',
	blog: '/blog/[slug]',
	maquilleuses: '/maquilleuses/[department]',
}

/**
 * The route of a page: the address with its parameters replaced by their name (`/profil/zoe-x` gives `/profil/[slug]`).
 * What a page is called never leaves the browser through here: the route tells where an error or a click came from.
 */
export function routeOf(pathname: string): string {
	const segments = bareSegments(pathname)
	const [first, second] = segments
	if (first === undefined) return '/'
	const pattern = NAMED[first.toLowerCase()]
	if (pattern !== undefined && second !== undefined && segments.length === 2) return pattern
	return `/${segments.slice(0, 4).join('/')}`
}

/**
 * The address of a 404, to find the broken links: the query and the hash are gone and the name of a profile is left out
 * (a profile that was deleted or renamed is a person). A talent or an article that does not exist keeps its slug, a
 * specialty or a title, and so does every other address, except a segment that looks like an email or a phone number.
 */
export function notFoundPath(pathname: string): string {
	const segments = bareSegments(pathname)
	if (segments[0]?.toLowerCase() === 'profil' && segments.length > 1) return '/profil/[slug]'
	return `/${segments
		.slice(0, 5)
		.map(segment => (looksLikePersonalData(decodedSegment(segment)) ? '[masqué]' : segment))
		.join('/')}`
}

function decodedSegment(segment: string): string {
	try {
		return decodeURIComponent(segment)
	} catch {
		return segment
	}
}

/** What the visitor chose of the price range, for `search_refine`. */
export function budgetUse(minimum: number | null, maximum: number | null): MyMakeupEvents['search_refine']['budget'] {
	if (minimum !== null && maximum !== null) return 'fourchette'
	if (minimum !== null) return 'minimum'
	return maximum !== null ? 'maximum' : 'aucun'
}

/**
 * Where a visitor came from, told by the address of the page she left (the one a click happened on, else the
 * `document.referrer`). `origin` is the origin of the site. No page is « direct », another site « externe ».
 */
export function viewOrigin(
	previousPage: string | null,
	referrer: string,
	origin: string
): MyMakeupEvents['profile_view']['from'] {
	let path = previousPage
	if (path === null) {
		if (referrer === '' || !URL.canParse(referrer)) return 'direct'
		const address = new URL(referrer)
		if (address.origin !== origin) return 'externe'
		path = address.pathname
	}
	const first = bareSegments(path)[0]?.toLowerCase()
	if (first === undefined) return 'accueil'
	if (first === 'search') return 'recherche'
	if (first === 'maquilleuses') return 'zone'
	if (first === 'talent' || first === 'classement' || first === 'blog') return first
	return 'autre_page'
}

/** What an in-text link of an article leads to: its kind, never its address. `origin` is the origin of the site. */
export function articleLinkKind(href: string, origin: string): MyMakeupEvents['article_link_click']['kind'] {
	if (!URL.canParse(href, origin)) return 'externe'
	const address = new URL(href, origin)
	if (address.origin !== origin) return 'externe'
	const first = bareSegments(address.pathname)[0]?.toLowerCase()
	if (first === 'search') return 'recherche'
	if (first === 'profil') return 'profil'
	return first === 'auth' ? 'inscription' : 'interne'
}
