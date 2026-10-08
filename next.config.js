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
	// The auth test suite (npm run test:auth) builds into its own folder, so it
	// never overwrites the .next of a dev server or of the image build.
	distDir: process.env.NEXT_DIST_DIR || '.next',
}

module.exports = nextConfig
