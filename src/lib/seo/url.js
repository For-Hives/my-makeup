/**
 * Absolute URLs of the site (SEO-10): canonical, sitemap, robots.txt, Open
 * Graph and JSON-LD all start from the same origin, read from
 * NEXT_PUBLIC_URL with or without a trailing slash (the old sitemap wrote
 * « https://my-makeup.fr//profil/… » when it had one).
 */

export const SITE_PAR_DEFAUT = 'https://my-makeup.fr'

/**
 * Origin of the site, without trailing slash: NEXT_PUBLIC_URL when it is an
 * http(s) URL, else https://my-makeup.fr.
 * @param {unknown} [brut] - NEXT_PUBLIC_URL (inlined at build time)
 * @returns {string}
 */
export function urlDuSite(brut = process.env.NEXT_PUBLIC_URL) {
	if (typeof brut !== 'string' || brut.trim() === '') return SITE_PAR_DEFAUT
	try {
		const url = new URL(brut.trim())
		return ['http:', 'https:'].includes(url.protocol) ? url.origin : SITE_PAR_DEFAUT
	} catch {
		return SITE_PAR_DEFAUT
	}
}

/**
 * Path made of encoded segments: chemin('profil', 'zoé lefèvre') →
 * /profil/zo%C3%A9%20lef%C3%A8vre.
 * @param {...(string|number)} segments
 * @returns {string}
 */
export function chemin(...segments) {
	return `/${segments.map(s => encodeURIComponent(String(s))).join('/')}`
}

/**
 * Absolute URL of a path of the site: one slash between the origin and the
 * path, runs of slashes merged, no trailing slash (the home page is the
 * origin itself).
 * @param {string} [cheminRelatif] - '/blog', 'blog', '/'
 * @param {string} [site] - urlDuSite()
 * @returns {string}
 */
export function urlAbsolue(cheminRelatif = '/', site = urlDuSite()) {
	const origine = urlDuSite(site)
	const propre = String(cheminRelatif ?? '')
		.replace(/\/{2,}/g, '/')
		.replace(/^\/+|\/+$/g, '')
	return propre === '' ? origine : `${origine}/${propre}`
}
