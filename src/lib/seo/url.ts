import { SITE_ORIGIN } from '../frozen-urls'

/**
 * Absolute addresses of the site (ticket 070). The origin is the constant apex of the site, never
 * an environment variable: NEXT_PUBLIC_SITE_URL is inlined when the build runs, and the build runs
 * without it.
 */

/** The path of an address, with no query, no fragment, no run of slashes and no final slash. */
export function cleanPath(brut: string): string {
	let path = brut.trim()
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path) && URL.canParse(path)) path = new URL(path).pathname
	path = path.split(/[?#]/, 1)[0] ?? ''
	path = `/${path}`.replace(/\/{2,}/g, '/')
	return path.length > 1 ? path.replace(/\/+$/, '') : path
}

/** The canonical address of a path: absolute, on the apex, without a final slash or a parameter. */
export function canonicalUrl(chemin: string): string {
	const clean = cleanPath(chemin)
	return clean === '/' ? SITE_ORIGIN : `${SITE_ORIGIN}${clean}`
}
