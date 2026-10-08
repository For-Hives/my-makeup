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
	// The auth test suite (npm run test:auth) builds into its own folder, so it
	// never overwrites the .next of a dev server or of the image build.
	distDir: process.env.NEXT_DIST_DIR || '.next',
}

module.exports = nextConfig
