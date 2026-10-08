import { urlAbsolue } from './url.js'

/**
 * What search engines may index (SEO-10, plans/03 §5.1): never the account
 * pages (/auth/*) nor the search (/search). They are not blocked in
 * robots.txt, or the noindex would never be read: they answer
 * `noindex,follow` (meta in the page and X-Robots-Tag in next.config.js).
 */

export const NOINDEX = 'noindex,follow'

/** Path prefixes never indexed (next.config.js sends the same header) */
export const CHEMINS_NOINDEX = ['/auth', '/search']

/**
 * Meta robots of a page of the site, by its route (router.pathname), or
 * null when the page decides (profiles) or is indexable.
 * @param {unknown} pathname - e.g. /auth/signin, /search, /profil/[username]
 * @returns {string|null}
 */
export function robotsPourChemin(pathname) {
	if (typeof pathname !== 'string') return null
	if (['/404', '/500', '/_error'].includes(pathname)) return NOINDEX
	return CHEMINS_NOINDEX.some(
		prefixe => pathname === prefixe || pathname.startsWith(`${prefixe}/`)
	)
		? NOINDEX
		: null
}

/**
 * robots.txt: everything open except the API routes, and the sitemap.
 * @param {string} [site] - urlDuSite(), with or without trailing slash
 * @returns {string}
 */
export function robotsTxt(site) {
	return [
		'User-agent: *',
		'Allow: /',
		'Disallow: /api/',
		'',
		`Sitemap: ${urlAbsolue('/sitemap.xml', site)}`,
		'',
	].join('\n')
}
