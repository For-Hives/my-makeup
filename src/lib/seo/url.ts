import { SITE_ORIGIN } from '../frozen-urls'

/**
 * Absolute addresses of the site (ticket 070). The origin is the constant apex of the site, never
 * an environment variable: NEXT_PUBLIC_SITE_URL is inlined when the build runs, and the build runs
 * without it.
 */

/** The path of an address, with no query, no fragment, no run of slashes and no final slash. */
export function cheminPropre(brut: string): string {
	let chemin = brut.trim()
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(chemin) && URL.canParse(chemin)) chemin = new URL(chemin).pathname
	chemin = chemin.split(/[?#]/, 1)[0] ?? ''
	chemin = `/${chemin}`.replace(/\/{2,}/g, '/')
	return chemin.length > 1 ? chemin.replace(/\/+$/, '') : chemin
}

/** The canonical address of a path: absolute, on the apex, without a final slash or a parameter. */
export function urlCanonique(chemin: string): string {
	const propre = cheminPropre(chemin)
	return propre === '/' ? SITE_ORIGIN : `${SITE_ORIGIN}${propre}`
}
