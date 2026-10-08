const UMAMI_ORIGIN_DEFAULT = 'https://umami.wadefade.fr'

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
		throw new Error(
			`UMAMI_ORIGIN doit être une origine http(s) comme https://umami.example.org (reçu : ${raw})`
		)
	return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
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
	},
	cacheMaxMemorySize: 0,
	// SEO-10: the account pages and the search are never indexed. Same paths
	// as CHEMINS_NOINDEX in src/lib/seo/robots.js (checked by
	// tests/unit/seo.test.mjs); robots.txt does not block them, or this
	// header would never be read.
	async headers() {
		return ['/auth', '/auth/:path*', '/search'].map(source => ({
			source,
			headers: [{ key: 'X-Robots-Tag', value: 'noindex, follow' }],
		}))
	},
	// MES-10: Umami served from the site, so the blockers that filter the
	// domain of the instance stop hiding real visits. Two paths only, never
	// the dashboard; src/middleware.js cleans the headers on the way (no
	// cookie, the visitor's IP only).
	async rewrites() {
		const umami = umamiOrigin()
		return [
			{ source: '/u/script.js', destination: `${umami}/script.js` },
			{ source: '/u/api/send', destination: `${umami}/api/send` },
		]
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
