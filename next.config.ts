import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import { dashboardHeaders } from './src/lib/auth/dashboard-headers'
import { mediaOrigin } from './src/lib/env'
import { benchImages, mediaRemotePattern, securityHeaders } from './src/lib/security-headers'
import { HOME_PAGE_PATH } from './src/lib/urls/home-page'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Two facts read when this file is loaded.
// The origin the photos are served from: a refused R2_PUBLIC_URL stops the build, the dev server
// and the start. `next build` writes the headers into the build, and `next start` loads this
// file again for `/_next/image`: both must be given the same R2_PUBLIC_URL.
const media = mediaOrigin(process.env.R2_PUBLIC_URL)
// The local storage of the test bench, when the bench gives it (never in production): its photos are fetched
// over http from the loopback interface. Null otherwise.
const banc = benchImages(process.env.BENCH_IMAGES)
// True under `next dev` only.
const development = process.env.NODE_ENV === 'development'

const nextConfig: NextConfig = {
	// The build gives `.next/standalone`: a server with only the files it needs, which is all
	// the Docker image copies (Dockerfile, last stage).
	output: 'standalone',
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
		// 75 is the default of Next; 90 is for the photos in an arch and the cards of the home page (issue 1138). A quality
		// that is not listed is brought back to the nearest one listed, so without 90 here every `quality={90}` was 75.
		qualities: [75, 90],
		remotePatterns: [mediaRemotePattern(media), ...(banc ? [banc.remotePattern] : [])],
		...(banc && { dangerouslyAllowLocalIP: true }),
	},
	// The key file of IndexNow, `/<key>.txt` at the root (ticket 219), is answered by a route that reads
	// INDEXNOW_KEY: it is no file of the repository. Only a 32-character hexadecimal name is rewritten.
	// The home page `/` is served by a page of a dynamic segment, so that its HTML is kept in the cache of Next
	// without being rendered at build (ticket 269, src/lib/urls/home-page.ts).
	rewrites: async () => [
		{ source: '/:key([0-9a-f]{32}).txt', destination: '/api/indexnow/:key' },
		{ source: '/', destination: HOME_PAGE_PATH },
	],
	// Every path leaves with the security headers (src/lib/security-headers.ts). A ticket that
	// needs a header on some paths adds its own entry after this one.
	headers: async () => [
		{ source: '/:path*', headers: securityHeaders({ development, mediaOrigin: media }) },
		// The authentication pages and the space: never cached, never indexed (tickets 074 and 075).
		{ source: '/auth/:path*', headers: dashboardHeaders() },
	],
}

// withPayload must stay the outermost wrapper: it adds Payload's server packages and aliases.
const withPayloadConfig = withPayload(nextConfig, { devBundleServerPackages: false })

/**
 * withPayload sends `Accept-CH`, `Critical-CH` and `Vary` for `Sec-CH-Prefers-Color-Scheme` on every path, for the theme
 * of its administration. On the public pages a `Critical-CH` the browser has not answered makes Chrome send the request
 * again with the hint: a second round trip before the first byte of every page on a fresh visit (+144 to +338 ms in the
 * Lighthouse runs of 23/10/2026, issue 1033), for a hint the public HTML never reads. The entry is kept for the
 * administration, the only reader of the hint.
 */
const carriesHint = (entry: { headers: { key: string }[] }): boolean =>
	entry.headers.some(({ key }) => key.toLowerCase() === 'critical-ch')

export default {
	...withPayloadConfig,
	headers: async () =>
		((await withPayloadConfig.headers?.()) ?? []).map(entry =>
			carriesHint(entry) ? { ...entry, source: '/admin/:path*' } : entry
		),
} satisfies NextConfig
