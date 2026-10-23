import { SITE_ORIGIN } from '../frozen-urls'

/**
 * What search engines may index (ticket 070, test U52): never the account pages (/auth) nor the
 * search (/search). These paths are not blocked in
 * robots.txt, or the noindex would never be read: they answer noindex, in a header and in a tag.
 */

export const NOINDEX = 'noindex, follow'

/** Path prefixes that are never indexed. */
export const NOINDEX_PATHS: readonly string[] = ['/auth', '/search']

export function isNoindexPath(chemin: string): boolean {
	const clean = chemin.split(/[?#]/, 1)[0] ?? ''
	return NOINDEX_PATHS.some(prefixe => clean === prefixe || clean.startsWith(`${prefixe}/`))
}

/**
 * The robots directive of a response, or nothing when the page decides for itself. There is no
 * staging environment (ticket 232): the noindex of the temporary host comes from the host (Coolify), not from here.
 */
export function robotsForPath(chemin: string): string | undefined {
	return isNoindexPath(chemin) ? NOINDEX : undefined
}

/** The single source of robots.txt (ticket 115, test E63): open to all, except the API routes. */
export const SITEMAP_PATH = '/sitemap.xml'
export const DISALLOWED_PATHS: readonly string[] = ['/api/']

export function robotsRules(): {
	rules: { userAgent: string; allow: string; disallow: string[] }
	sitemap: string
} {
	return {
		rules: { userAgent: '*', allow: '/', disallow: [...DISALLOWED_PATHS] },
		// Absolute, on the apex: the same constant as the canonical addresses, never an environment variable.
		sitemap: `${SITE_ORIGIN}${SITEMAP_PATH}`,
	}
}
