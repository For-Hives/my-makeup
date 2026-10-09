const umamiOriginPattern1 = /\/+$/
const UMAMI_ORIGIN_DEFAULT = 'https://umami.wadefade.fr'
// Windows treats ISR cache filenames as case-insensitive. The browser suite
// exercises /profil/LeaNantes and /profil/leanantes as distinct URLs, so keep
// its cache in memory to reproduce the production Linux filesystem behavior.
const WINDOWS_REGRESSION_CACHE = process.platform === 'win32' && process.env.NEXT_DIST_DIR === '.next-test-regression'

/**
 * Umami instance behind /u (MES-10): UMAMI_ORIGIN, e.g.
 * https://umami.example.org (a path is allowed, never a query string);
 * empty: the current instance. Read at build time (Coolify « Build
 * Variable », then redeploy): the rewrites are written into the build. An
 * invalid value stops the build instead of sending the visits nowhere.
 * @param {unknown} [raw]
 * @returns {string} origin and path, without trailing slash
 */
function umamiOrigin(raw = process.env.UMAMI_ORIGIN) {
	if (typeof raw !== 'string' || raw.trim() === '') return UMAMI_ORIGIN_DEFAULT
	let url = null
	try {
		url = new URL(raw.trim())
	} catch {
		url = null
	}
	if (
		url === null ||
		!['http:', 'https:'].includes(url.protocol) ||
		url.search !== '' ||
		url.hash !== '' ||
		url.username !== '' ||
		url.password !== ''
	)
		throw new Error(`UMAMI_ORIGIN doit être une origine http(s) comme https://umami.example.org (reçu : ${raw})`)
	return `${url.origin}${url.pathname.replace(umamiOriginPattern1, '')}`
}

/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	poweredByHeader: false,
	images: {
		// Only the hosts that really serve images to next/image (inventory of
		// 2026-10-08): every Strapi media (profile pictures, galleries, formats)
		// is served from the R2 bucket below; all other images live in /public.
		remotePatterns: [
			{
				protocol: 'https',
				hostname: 'r2-my-makeup.andy-cinquin.fr',
				port: '',
				pathname: '/**',
			},
		],
		// The only qualities the optimizer makes (any other q gets a 400, and
		// Next.js 16 requires the list): 75, its default, for the decorations,
		// the shared pictures (src/lib/seo/meta.js) and the main photo of a
		// profile; 85 for the photos of the search cards and of the portfolio
		// (QUALITE_PHOTO in src/lib/taille-image.js, UI-09).
		qualities: [75, 85],
		// The widths of Next.js, plus 1440 between 1200 and 1920: a landscape
		// portfolio slide needs 1 334 px on a 2x screen, which took the 1920
		// one (1.8 times the pixels). Not more steps: a picture whose `sizes`
		// says less than it is drawn (100vw of a decoration in cover) would
		// take less than before. 1200 stays (LARGEUR_PARTAGE in
		// src/lib/seo/meta.js).
		deviceSizes: [640, 750, 828, 1080, 1200, 1440, 1920, 2048, 3840],
	},
	cacheMaxMemorySize: WINDOWS_REGRESSION_CACHE ? 50 * 1024 * 1024 : 0,
	// SEO-10: the account pages and the search are never indexed. Same paths
	// as CHEMINS_NOINDEX in src/lib/seo/robots.js (checked by
	// tests/unit/seo.test.mjs); robots.txt does not block them, or this
	// header would never be read.
	// biome-ignore lint/suspicious/useAwait: Next.js requires a promise-returning configuration hook.
	async headers() {
		return ['/auth', '/auth/:path*', '/search'].map(source => ({
			source,
			headers: [{ key: 'X-Robots-Tag', value: 'noindex, follow' }],
		}))
	},
	// MES-10: Umami served from the site, so the blockers that filter the
	// domain of the instance stop hiding real visits. Two paths only, never
	// the dashboard; src/middleware.js cleans the headers on the way (no
	// cookie, the visitor's IP only). A request that still carries a cookie
	// or credentials, one the middleware did not clean, is never relayed:
	// the rewrite does not apply and the site answers 404.
	// biome-ignore lint/suspicious/useAwait: Next.js requires a promise-returning configuration hook.
	async rewrites() {
		const umami = umamiOrigin()
		const missing = [
			{ type: 'header', key: 'cookie' },
			{ type: 'header', key: 'authorization' },
		]
		return [
			{ source: '/u/script.js', destination: `${umami}/script.js`, missing },
			{ source: '/u/api/send', destination: `${umami}/api/send`, missing },
		]
	},
	experimental: {
		isrFlushToDisk: !WINDOWS_REGRESSION_CACHE,
		// Rewrites and headers match the exact case of the path, like the
		// middleware matcher: /U/script.js or /u/API/send are not relayed to
		// Umami without going through the middleware, they get a 404.
		caseSensitiveRoutes: true,
		// A silent Umami is cut after 10 s instead of 30 (the default of Next):
		// the page never waits for it (async script, src/pages/_document.js),
		// but its load event does, and the server holds the request meanwhile.
		// The script and a send normally take well under a second.
		proxyTimeout: 10_000,
	},
	env: {
		// SOURCE_COMMIT as Coolify gives it to the build, frozen into the bundles:
		// pages prerendered at build time and pages rendered later carry the same
		// data-tag (src/lib/version.js).
		BUILD_SOURCE_COMMIT: process.env.SOURCE_COMMIT || '',
	},
	// The auth test suite (npm run test:auth) builds into its own folder, so it
	// never overwrites the .next of a dev server or of the image build.
	distDir: process.env.NEXT_DIST_DIR || '.next',
}

module.exports = nextConfig
