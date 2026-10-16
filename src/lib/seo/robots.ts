import { SITE_ORIGIN } from '../urls-gelees'

/**
 * What search engines may index (ticket 070, test U52): never the account pages (/auth) nor the
 * search (/search). These paths are not blocked in
 * robots.txt, or the noindex would never be read: they answer noindex, in a header and in a tag.
 */

export const NOINDEX = 'noindex, follow'

/** Path prefixes that are never indexed. */
export const CHEMINS_NOINDEX: readonly string[] = ['/auth', '/search']

export function estCheminNoindex(chemin: string): boolean {
	const propre = chemin.split(/[?#]/, 1)[0] ?? ''
	return CHEMINS_NOINDEX.some(prefixe => propre === prefixe || propre.startsWith(`${prefixe}/`))
}

/**
 * The robots directive of a response, or nothing when the page decides for itself. There is no
 * staging environment (ticket 232): the noindex of the temporary host comes from the host (Coolify), not from here.
 */
export function robotsPourChemin(chemin: string): string | undefined {
	return estCheminNoindex(chemin) ? NOINDEX : undefined
}

/** The single source of robots.txt (ticket 115, test E63): open to all, except the API routes. */
export const CHEMIN_DU_SITEMAP = '/sitemap.xml'
export const CHEMINS_INTERDITS: readonly string[] = ['/api/']

export function reglesRobots(): {
	rules: { userAgent: string; allow: string; disallow: string[] }
	sitemap: string
} {
	return {
		rules: { userAgent: '*', allow: '/', disallow: [...CHEMINS_INTERDITS] },
		// Absolute, on the apex: the same constant as the canonical addresses, never an environment variable.
		sitemap: `${SITE_ORIGIN}${CHEMIN_DU_SITEMAP}`,
	}
}
