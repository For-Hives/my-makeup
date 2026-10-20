/**
 * The security headers every response leaves with, and the pattern of the one remote host the
 * image optimizer may fetch from.
 *
 * Both are read by next.config.ts when Next loads its configuration, so: no `next` import, and
 * nothing here reads the environment. The caller gives the two facts that change the answer.
 */

export type ResponseHeader = { key: string; value: string }

export type SecurityOptions = {
	/** True under `next dev` only: React then needs `eval` to rebuild its call stacks. */
	development: boolean
	/** The origin the photos are served from: `mediaOrigin` of src/lib/env.ts. */
	mediaOrigin: string
}

/** One year, in seconds. */
const HSTS_MAX_AGE = 365 * 24 * 60 * 60

/**
 * The content policy, sent in report-only mode: a browser reports what it would have refused
 * (in its console, no report is sent anywhere) and refuses nothing.
 *
 * It names one remote origin, the photos. Measurement goes through the site's own `/u` path:
 * no third-party domain is listed for it, and none must be added.
 */
export function contentSecurityPolicy({ development, mediaOrigin }: SecurityOptions): string {
	const directives: [name: string, sources: string[]][] = [
		['default-src', ["'self'"]],
		// Next writes inline scripts into every page to hand the server render over to React, and
		// a page rendered ahead of time cannot carry a nonce per request.
		['script-src', ["'self'", "'unsafe-inline'", ...(development ? ["'unsafe-eval'"] : [])]],
		['style-src', ["'self'", "'unsafe-inline'"]],
		// data: and blob: are the placeholders and the preview of a photo before it is sent.
		['img-src', ["'self'", 'data:', 'blob:', mediaOrigin]],
		['font-src', ["'self'"]],
		['connect-src', ["'self'"]],
		['worker-src', ["'self'", 'blob:']],
		['object-src', ["'none'"]],
		['base-uri', ["'self'"]],
		['form-action', ["'self'"]],
		// 'self' and not 'none': the admin shows the pages of the site in a frame to preview them.
		['frame-ancestors', ["'self'"]],
	]
	return directives.map(([name, sources]) => `${name} ${sources.join(' ')}`).join('; ')
}

/**
 * The five headers, the same on every path.
 *
 * No value may hold « :path »: Next would replace it by the path of the request, since the
 * headers are attached to the source `/:path*` (next.config.ts).
 */
export function securityHeaders(options: SecurityOptions): ResponseHeader[] {
	return [
		// A browser that has seen the site over https never asks for it over http again, for one
		// year. This host only: no `includeSubDomains`, no `preload`. Ignored when read over http.
		{ key: 'Strict-Transport-Security', value: `max-age=${HSTS_MAX_AGE}` },
		// A file is what its Content-Type says, never what its bytes look like.
		{ key: 'X-Content-Type-Options', value: 'nosniff' },
		// Another site learns the origin a visitor comes from, never the path nor the query.
		{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
		// The site uses none of these, so neither a page nor a frame inside it can ask for them.
		{ key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(), payment=(), usb=()' },
		{ key: 'Content-Security-Policy-Report-Only', value: contentSecurityPolicy(options) },
	]
}

/**
 * The only remote address `/_next/image` accepts: any file of the media origin, over https.
 * Given an origin that is not https, the pattern matches nothing.
 */
export function mediaRemotePattern(mediaOrigin: string): {
	hostname: string
	pathname: string
	port: string
	protocol: 'https'
} {
	const url = new URL(mediaOrigin)
	return { hostname: url.hostname, pathname: '/**', port: url.port, protocol: 'https' }
}

/**
 * The storage of the test bench, as the image optimizer may fetch from it (ticket 103). The simulator of
 * the bench serves photos over plain http on the loopback interface, which `/_next/image` refuses by
 * default (https only, no local address): without this, no photo of the bench loads. Production never
 * sets BENCH_IMAGES (the bench sets it, for the build and for the server); a value that is not exactly
 * `http://127.0.0.1:<port>/<bucket>` (or `localhost`) throws, so that nothing wider than one local
 * folder can be opened by mistake. Empty or missing: nothing is opened.
 */
export function benchImages(raw: string | undefined): {
	dangerouslyAllowLocalIP: true
	remotePattern: { hostname: string; pathname: string; port: string; protocol: 'http' }
} | null {
	if (raw === undefined || raw.trim() === '') return null
	const url = URL.canParse(raw) ? new URL(raw) : undefined
	const bucket = url?.pathname.slice(1) ?? ''
	const loopback = url?.hostname === '127.0.0.1' || url?.hostname === 'localhost'
	if (!url || url.protocol !== 'http:' || !loopback || url.port === '' || !/^[a-z0-9][a-z0-9.-]*$/.test(bucket)) {
		throw new Error('BENCH_IMAGES refusée. Attendu : http://127.0.0.1:PORT/ESPACE.')
	}
	if (raw !== `${url.origin}/${bucket}`)
		throw new Error('BENCH_IMAGES refusée. Attendu : http://127.0.0.1:PORT/ESPACE.')
	return {
		dangerouslyAllowLocalIP: true,
		remotePattern: { hostname: url.hostname, pathname: `/${bucket}/**`, port: url.port, protocol: 'http' },
	}
}
