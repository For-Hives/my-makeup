import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import { enTetesEspace } from './src/lib/auth/entetes-espace'
import { mediaOrigin } from './src/lib/env'
import { imagesDuBanc, mediaRemotePattern, securityHeaders } from './src/lib/security-headers'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Two facts read when this file is loaded.
// The origin the photos are served from: a refused R2_PUBLIC_URL stops the build, the dev server
// and the start. `next build` writes the headers into the build, and `next start` loads this
// file again for `/_next/image`: both must be given the same R2_PUBLIC_URL.
const media = mediaOrigin(process.env.R2_PUBLIC_URL)
// The local storage of the test bench, when the bench gives it (never in production): its photos are fetched
// over http from the loopback interface. Null otherwise.
const banc = imagesDuBanc(process.env.IMAGES_DU_BANC)
// True under `next dev` only.
const development = process.env.NODE_ENV === 'development'

const nextConfig: NextConfig = {
	// The build gives `.next/standalone`: a server with only the files it needs, which is all
	// the Docker image copies (Dockerfile, last stage).
	output: 'standalone',
	// The photos of the fictional set are read from the disk when the pre-production loads it
	// (src/preprod/jeu.ts, ticket 053): no import names them, so the trace of the build would
	// leave them out of the standalone server.
	outputFileTracingIncludes: { '/**': ['./src/jeu-fictif/photos/**'] },
	// The commit Coolify gives to the build (SOURCE_COMMIT), frozen into the bundles: the
	// version of /api/health is then the commit of the build, even in a container that
	// receives no SOURCE_COMMIT. Empty when the build had none: the route reads the runtime one.
	env: { BUILD_SOURCE_COMMIT: process.env.SOURCE_COMMIT || '' },
	// `next dev` writes an AGENTS.md and a CLAUDE.md at the project root when it is started
	// by a coding agent. The guides of this repository are written by hand: nothing is generated.
	agentRules: false,
	// The app has two root layouts, so an address no route matches needs src/app/global-not-found.tsx
	// to answer a 404 in French, in the template of the site.
	experimental: { globalNotFound: true },
	// The project root is stated, not inferred: a lockfile higher up in the file tree
	// (a parent folder, another checkout) must not become the Turbopack root.
	turbopack: { root: dirname },
	// The final slash is answered by src/proxy.ts (ticket 072), in one hop and with the redirects of the
	// frozen table: Next's own 308 would make `/toutes-les-news/` a chain of two.
	skipTrailingSlashRedirect: true,
	// No response says what the site runs on. It also stops withPayload from adding its own
	// « X-Powered-By: Next.js, Payload » to every path.
	poweredByHeader: false,
	// `/_next/image` fetches a remote file from the media origin only: any other host gets a 400.
	images: {
		remotePatterns: [mediaRemotePattern(media), ...(banc ? [banc.remotePattern] : [])],
		...(banc && { dangerouslyAllowLocalIP: true }),
	},
	// The key file of IndexNow, `/<key>.txt` at the root (ticket 219), is answered by a route that reads
	// INDEXNOW_KEY: it is no file of the repository. Only a 32-character hexadecimal name is rewritten.
	rewrites: async () => [{ source: '/:cle([0-9a-f]{32}).txt', destination: '/api/indexnow/:cle' }],
	// Every path leaves with the security headers (src/lib/security-headers.ts). A ticket that
	// needs a header on some paths adds its own entry after this one.
	headers: async () => [
		{ source: '/:path*', headers: securityHeaders({ development, mediaOrigin: media }) },
		// The authentication pages and the space: never cached, never indexed (tickets 074 and 075).
		{ source: '/auth/:path*', headers: enTetesEspace() },
	],
}

// withPayload must stay the outermost wrapper: it adds Payload's server packages and aliases.
export default withPayload(nextConfig, { devBundleServerPackages: false })
