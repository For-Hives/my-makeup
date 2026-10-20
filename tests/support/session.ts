/**
 * A session opened without a login form, in the two shapes a test needs: the headers of an
 * HTTP client, and the cookie of a browser context.
 *
 * The session is a real one: Payload opens it through its own login, signs the token and
 * records the session on the account, exactly as the login route does. An account that has no
 * password anybody knows (an old Google account) gets its session the way a login by Google
 * opens one: `ouvrirSessionSansMotDePasse`.
 */

import { type AuthCollectionSlug, generatePayloadCookie, type Payload } from 'payload'
import { cookieEndOfLife } from '../../src/lib/auth/session-state'
import { type DesignatedAccount, openWithoutPassword, openWithPassword } from '../../src/lib/auth/token'
import { RefusedBench, type Variables } from './bench'

/** A cookie as a browser context takes it: the shape of Playwright's `context.addCookies()`. */
export interface BrowserCookie {
	name: string
	value: string
	/** The origin of the site: the cookie belongs to that host and to every path. */
	url: string
	/** End of the session, Unix time in seconds. */
	expires: number
	httpOnly: boolean
	secure: boolean
	sameSite: 'Lax' | 'None' | 'Strict'
}

export interface Session {
	/**
	 * For a client that is not a browser (`fetch`, a route called in a test): the cookie and the
	 * `Origin` that goes with it. Without `Origin`, the application ignores the cookie.
	 */
	enTetes: { Cookie: string; Origin: string }
	/** For a browser: `await context.addCookies(session.cookies)`, then open the site at its address. */
	cookies: BrowserCookie[]
	/** When the session ends. */
	expire: Date
}

export type { DesignatedAccount }

export interface Identifiers {
	collection: AuthCollectionSlug
	email: string
	motDePasse: string
}

/**
 * The address the application is served from on the bench. A session cookie is accepted from
 * that origin only, so it must be one the configuration trusts: otherwise the session would be
 * ignored without a word.
 */
export function siteOrigin(payload: Pick<Payload, 'config'>, variables: Variables = process.env): string {
	const origin = variables.NEXT_PUBLIC_SITE_URL
	if (!origin || !payload.config.csrf.includes(origin))
		throw new RefusedBench(
			'NEXT_PUBLIC_SITE_URL n’est pas une origine de confiance de cette configuration : une session y serait ignorée.'
		)
	return origin
}

/** Logs the account in through Payload and gives the session back, ready for an HTTP client and for a browser. */
export async function openSession(
	payload: Payload,
	{ collection, email, motDePasse }: Identifiers,
	variables: Variables = process.env
): Promise<Session> {
	const origin = siteOrigin(payload, variables)
	const { exp, token } = await openWithPassword(payload, collection, { email, password: motDePasse })
	if (!token || !exp) throw new Error(`Payload n’a ouvert aucune session pour ce compte « ${collection} ».`)
	return tokenSession(payload, collection, { exp, token }, origin)
}

/** `dureeS`: how long the token lives, in seconds, instead of the collection's own (negative: it is born expired). */
export interface SessionOptions {
	dureeS?: number
}

/**
 * Opens a session for an account without its password: the steps Payload takes once a password
 * is accepted, which a login by Google takes once Google has vouched for the address (plan 01
 * §2.3) — a session recorded on the account, then a token signed with its identifier.
 *
 * For an account that may log in, and that has no password anybody knows. Nothing here checks
 * whether the account is confirmed or blocked: Payload ignores the session of an account that is
 * not confirmed, and the site's own rules for a blocked account belong to the login (ticket 089).
 */
export async function openSessionWithoutPassword(
	payload: Payload,
	{ collection, id }: DesignatedAccount,
	variables: Variables = process.env,
	options: SessionOptions = {}
): Promise<Session> {
	const origin = siteOrigin(payload, variables)
	const { exp, token } = await openWithoutPassword(payload, { collection, id }, options.dureeS)
	return tokenSession(payload, collection, { exp, token }, origin)
}

/** The two shapes of a session, from the token Payload signed for it. */
function tokenSession(
	payload: Payload,
	collection: AuthCollectionSlug,
	{ exp, token }: { exp: number; token: string },
	origine: string
): Session {
	// The cookie of the real login route: same name, same attributes.
	const cookie = generatePayloadCookie({
		collectionAuthConfig: payload.collections[collection].config.auth,
		cookiePrefix: payload.config.cookiePrefix,
		returnCookieAsObject: true,
		token,
	})
	return {
		enTetes: { Cookie: `${cookie.name}=${token}`, Origin: origine },
		cookies: [
			{
				name: cookie.name,
				value: token,
				url: origine,
				// As the site sets it: the cookie outlives its token (ticket 080).
				expires: Math.floor(cookieEndOfLife(exp).getTime() / 1000),
				httpOnly: cookie.httpOnly ?? false,
				secure: cookie.secure ?? false,
				sameSite: cookie.sameSite ?? 'Lax',
			},
		],
		expire: new Date(exp * 1000),
	}
}
