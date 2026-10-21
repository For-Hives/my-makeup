import { type NextRequest, NextResponse } from 'next/server'
import { ipClient } from '@/lib/auth/client-ip'
import { dashboardDecision, isPrivatePage, SESSION_COOKIE } from '@/lib/auth/closed-dashboard'
import { linkPlan, PASSWORD_RESET_COOKIE } from '@/lib/auth/forgot-password'
import {
	CUTOVER_VARIABLE,
	cleanupPlan,
	clearingCookie,
	MESSAGE_COOKIE,
	MESSAGE_DURATION_SECONDS,
	MESSAGE_HEADER,
} from '@/lib/auth/legacy-cookies'
import { comesFromOtherSite, RELAY_HEADERS, relayPage } from '@/lib/auth/relay-page'
import { REFUSAL_PATH, SIGN_UP_PATH, secondsBeforeSignUp } from '@/lib/auth/sign-up-refusal'
import { CONTACT_PATH, CONTACT_THROTTLED_PATH, secondsBeforeThisRequestMessage } from '@/lib/contact/rate-limit'
import { rateLimitSearch } from '@/lib/search/rate-limit'
import { robotsForPath } from '@/lib/seo/robots'
import { isHomePageInternal } from '@/lib/urls/home-page'
import { shapeRedirect } from '@/lib/urls/shape'
import { type CheckedFamily, type PageAnswer, urlToCheck } from '@/lib/urls/unknown-page'

/**
 * One proxy, no matcher: it runs for every request.
 * - A repeated slash or a final slash answers one redirect to the final address (ticket 072): Next's own
 *   redirect of the final slash is off (next.config.ts), so that no address makes two hops.
 * - The private pages of the space answer one redirection to the sign-in page when no session cookie
 *   comes with the request (ticket 075), or when its end date has passed (ticket 080: with the
 *   « session expirée » message). The authoritative check is the page's own (`requireArtist`).
 * - The link of a forgotten-password mail (`/auth/reinitialiser?code=…`) answers one redirection to the bare
 *   page, the code kept in a cookie of that page only (ticket 085): it never reaches a page, the audience
 *   measurement, the history or a Referer.
 * - The search answers 429, in French, past 60 requests a minute from one address (ticket 100). No other
 *   page is braked.
 * - The cookies of the old authentication are expired on the first request, and the sign-in page tells
 *   once to sign in again (ticket 081). The back-office, the API and the files are left alone.
 * - A sign-up past the 5 an hour of its client address is sent to the route that answers 429 (ticket 084).
 * - A contact message past the 5 an hour of its client address, or the 20 a day of its mailbox (read from a
 *   copy of the body), is sent to the route that answers 429 (ticket 161). That path alone answers a promise.
 * - A private page asked with a session cookie by a navigation another site started (`Sec-Fetch-Site:
 *   cross-site`, a link in a mail) answers the relay page of the return from Google (ticket 223): Payload
 *   ignores the cookie of a cross-site request with no `Origin`, and the relay restarts the navigation
 *   from the site itself.
 * - The old address of a profile (an old username, a variant of the slug) answers one 308 to its slug, from the same
 *   lookup (ticket 269: a redirect raised by a page kept in the cache of Next carries a doubled `Location` header).
 * - An unknown slug under `/profil`, `/talent` or `/blog` is rewritten to the 404 page of the site, so that the HTML
 *   of the server carries its h1 (ticket 231; `notFound()` in a page only sends an empty shell). The slug is read
 *   through the same reads as the page, remembered for a minute when the page exists; a failed read lets the page answer.
 * - The internal address of the home page (`/home-cached/…`, ticket 269) is no address of the site: it answers
 *   the 404 page. `/` is rewritten to it by next.config.ts, after the proxy has run.
 * - A path that does not decode (`/profil/%E0%A4%A`) answers the 404 page of the site, not Next's error; under
 *   `/api/` it answers a JSON 400 (ticket 223).
 * - A response that carries a cookie of the cleaning is `private, no-store`: no shared cache keeps it (ticket 223).
 * - Every other response gets the robots directive (ticket 070). The paths of the account and of the
 *   search answer noindex everywhere.
 */
function siteProxy(requete: NextRequest) {
	const { pathname, search } = requete.nextUrl
	if (pathname.startsWith('/api/') && !canDecode(pathname)) {
		// Under the API Next would answer a 500 and an error-level line: a client error is a 400 in JSON.
		const refusal = NextResponse.json({ errors: [{ message: 'Adresse illisible.' }] }, { status: 400 })
		refusal.headers.set('X-Robots-Tag', 'noindex')
		return refusal
	}
	if (unreadablePath(pathname) || isHomePageInternal(pathname)) {
		// An address Next cannot decode answers its own error page: the 404 of the site is what a visitor expects.
		const notFound = NextResponse.rewrite(new URL(NOT_FOUND_PATH, requete.url ?? requete.nextUrl.href))
		notFound.headers.set('X-Robots-Tag', 'noindex')
		return notFound
	}
	// The path as the visitor wrote it: `nextUrl.pathname` may already have lost a repeated slash.
	const shape = shapeRedirect(writtenPath(requete.url ?? requete.nextUrl.href) ?? pathname)
	if (shape) {
		// A new URL on the host of the request: cloning `nextUrl` would keep the final slash it had.
		const shapeRedirect = NextResponse.redirect(
			new URL(`${shape.chemin}${search}`, requete.url ?? requete.nextUrl.href),
			shape.status
		)
		const shapeDirective = robotsForPath(pathname)
		if (shapeDirective) shapeRedirect.headers.set('X-Robots-Tag', shapeDirective)
		return shapeRedirect
	}
	const throttled = rateLimitSearch({ chemin: pathname, methode: requete.method, entetes: requete.headers })
	if (throttled) {
		const throttledResponse = new NextResponse(throttled.corps, {
			status: throttled.status,
			headers: throttled.entetes,
		})
		const throttledDirective = robotsForPath(pathname)
		if (throttledDirective) throttledResponse.headers.set('X-Robots-Tag', throttledDirective)
		return throttledResponse
	}
	const cleanup = cleanupPlan({
		chemin: pathname,
		noms: requete.cookies.getAll().map(cookie => cookie.name),
		prechargement: requete.headers.has('next-router-prefetch') || requete.headers.get('purpose') === 'prefetch',
		maintenant: new Date(),
		basculeLe: process.env[CUTOVER_VARIABLE],
	})
	// The header is the proxy's alone: whatever a visitor sends under that name is dropped.
	const headers = new Headers(requete.headers)
	headers.delete(MESSAGE_HEADER)
	if (cleanup.afficherLeMessage) headers.set(MESSAGE_HEADER, '1')
	if (
		requete.method === 'POST' &&
		pathname === SIGN_UP_PATH &&
		secondsBeforeSignUp(ipClient(requete.headers)) !== undefined
	) {
		// Past 5 sign-ups an hour from this address (ticket 084): a Server Action cannot answer 429
		// itself, so the request is sent to the route that does, before the action runs.
		return NextResponse.rewrite(new URL(REFUSAL_PATH, requete.url ?? requete.nextUrl.href))
	}
	const withCleanup = (reponse: NextResponse): NextResponse => {
		if (cleanup.aEffacer.length > 0 || cleanup.retenirLeMessage || cleanup.oublierLeMessage)
			// A page that sets a cookie is for this visitor alone (ticket 223).
			reponse.headers.set('Cache-Control', 'private, no-store')
		for (const name of cleanup.aEffacer) reponse.cookies.set(clearingCookie(name))
		if (cleanup.retenirLeMessage)
			reponse.cookies.set({
				name: MESSAGE_COOKIE,
				value: '1',
				maxAge: MESSAGE_DURATION_SECONDS,
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: process.env.NODE_ENV === 'production',
			})
		if (cleanup.oublierLeMessage)
			reponse.cookies.set({
				name: MESSAGE_COOKIE,
				value: '',
				maxAge: 0,
				expires: new Date(0),
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: process.env.NODE_ENV === 'production',
			})
		return reponse
	}
	const link = linkPlan(pathname, requete.nextUrl.searchParams)
	if (link) {
		const target = requete.nextUrl.clone()
		target.pathname = link.aller
		target.search = ''
		// 303: whatever the method, the next request is a GET of the bare page.
		const redirection = NextResponse.redirect(target, 303)
		redirection.cookies.set({
			name: PASSWORD_RESET_COOKIE,
			value: link.cookie.valeur,
			maxAge: link.cookie.maxAgeS,
			path: link.aller,
			httpOnly: true,
			sameSite: 'lax',
			secure: process.env.NODE_ENV === 'production',
		})
		redirection.headers.set('Cache-Control', 'private, no-store')
		redirection.headers.set('Referrer-Policy', 'no-referrer')
		const linkDirective = robotsForPath(pathname)
		if (linkDirective) redirection.headers.set('X-Robots-Tag', linkDirective)
		return withCleanup(redirection)
	}
	const to = dashboardDecision(
		pathname,
		search,
		requete.cookies.get(SESSION_COOKIE)?.value,
		Math.floor(Date.now() / 1000),
		requete.method
	)
	if (to) {
		// Built from the URL of the request, so the host is the one the visitor used (the Host header the proxy forwards).
		const target = requete.nextUrl.clone()
		const [path = '', searchQuery = ''] = to.split('?')
		target.pathname = path
		target.search = searchQuery ? `?${searchQuery}` : ''
		const redirection = NextResponse.redirect(target, 307)
		const redirectDirective = robotsForPath(pathname)
		if (redirectDirective) redirection.headers.set('X-Robots-Tag', redirectDirective)
		return withCleanup(redirection)
	}
	if (requete.method === 'GET' && isPrivatePage(pathname) && comesFromOtherSite(requete.headers)) {
		// She comes from another site with a session cookie that Payload would ignore (ticket 223): the
		// relay page restarts the navigation from this site, where the cookie counts.
		const relay = new NextResponse(relayPage(`${pathname}${search}`), { status: 200, headers: RELAY_HEADERS })
		const relayDirective = robotsForPath(pathname)
		if (relayDirective) relay.headers.set('X-Robots-Tag', relayDirective)
		return withCleanup(relay)
	}
	const response = withCleanup(NextResponse.next({ request: { headers: headers } }))
	const robotsDirective = robotsForPath(pathname)
	if (robotsDirective) response.headers.set('X-Robots-Tag', robotsDirective)
	return response
}

/** Where an address that does not decode is sent: no page lives there, so Next answers its 404 page. */
const NOT_FOUND_PATH = '/unknown-page'

/** True when the path has a percent sequence that does not decode, outside the API and Next's own files. */
function unreadablePath(chemin: string): boolean {
	if (chemin.startsWith('/api/') || chemin.startsWith('/_next/')) return false
	return !canDecode(chemin)
}

function canDecode(chemin: string): boolean {
	try {
		decodeURIComponent(chemin)
		return true
	} catch {
		return false
	}
}

/** The path of a request URL, with its repeated slashes: `new URL` keeps them, but not a base that swallows them. */
function writtenPath(url: string): string | undefined {
	const start = url.indexOf('://')
	if (start === -1) return undefined
	const rest = url.slice(url.indexOf('/', start + 3))
	return rest.split(/[?#]/, 1)[0]
}

/**
 * Next calls this and awaits what it returns. The type says `NextResponse`, as every path but one answers at
 * once; a contact POST answers a promise of one (the mailbox is read from the body), which only Next
 * and `contactProxy` rely on.
 */
export function proxy(requete: NextRequest): NextResponse
export function proxy(requete: NextRequest): NextResponse | Promise<NextResponse> {
	const response = siteProxy(requete)
	if (requete.method !== 'POST' || requete.nextUrl.pathname !== CONTACT_PATH) {
		// An answer of its own (redirect, rewrite, brake, relay page) comes first; only a plain pass-through is checked.
		if (!passesAsIs(response)) return response
		const a = urlToCheck(requete.nextUrl.pathname, requete.method)
		return a ? unknownAddressProxy(requete, response, a) : response
	}
	// A redirect of form (repeated or final slash) comes first, as for every other path.
	if (response.headers.has('location')) return response
	return contactProxy(requete, response)
}

/** True when the response lets the request through to the page: no status of its own. */
function passesAsIs(reponse: NextResponse): boolean {
	return reponse.status === 200 && reponse.headers.has('x-middleware-next')
}

type PageExistence = (famille: CheckedFamily, segment: string) => Promise<PageAnswer>

/** The real lookup, loaded on first use: the proxy of every other path never loads Payload. */
const realExistence: PageExistence = async (famille, segment) =>
	(await import('@/services/public/exists')).pageExists(famille, segment)

/**
 * An unknown profile, talent or article answers the 404 page of the site, in full (ticket 231). The lookup is the
 * page's own reads, and what exists is remembered for a minute (src/lib/urls/unknown-page.ts).
 * Any failure (a database that does not answer) leaves the page to answer, as before.
 */
export async function unknownAddressProxy(
	requete: NextRequest,
	reponse: NextResponse,
	{ famille, segment }: { famille: CheckedFamily; segment: string },
	existe: PageExistence = realExistence
): Promise<NextResponse> {
	let answer: PageAnswer
	try {
		answer = await existe(famille, segment)
	} catch {
		return reponse
	}
	if (answer === true) return reponse
	if (answer !== false) {
		// The old address of a profile: one 308 to its slug, answered here because a redirect raised by a page kept in
		// the cache of Next leaves with a doubled `Location` header (ticket 269).
		const redirection = NextResponse.redirect(
			new URL(`${answer.vers}${requete.nextUrl.search}`, requete.url ?? requete.nextUrl.href),
			308
		)
		for (const cookie of reponse.cookies.getAll()) redirection.cookies.set(cookie)
		const cacheOfRedirect = reponse.headers.get('cache-control')
		if (cacheOfRedirect) redirection.headers.set('Cache-Control', cacheOfRedirect)
		return redirection
	}
	const notFound = NextResponse.rewrite(new URL(NOT_FOUND_PATH, requete.url ?? requete.nextUrl.href))
	notFound.headers.set('X-Robots-Tag', 'noindex')
	// What the first response set (the cookies of the cleaning and their `Cache-Control`) leaves with this one.
	for (const cookie of reponse.cookies.getAll()) notFound.cookies.set(cookie)
	const cache = reponse.headers.get('cache-control')
	if (cache) notFound.headers.set('Cache-Control', cache)
	return notFound
}

/** The contact POST: past a brake (ticket 161), the request is rewritten to the route that answers 429 (same device as the sign-up, ticket 084). */
export async function contactProxy(requete: NextRequest, reponse = siteProxy(requete)): Promise<NextResponse> {
	const pending = await secondsBeforeThisRequestMessage(requete, ipClient(requete.headers))
	if (pending === undefined) return reponse
	return NextResponse.rewrite(new URL(CONTACT_THROTTLED_PATH, requete.url ?? requete.nextUrl.href))
}
