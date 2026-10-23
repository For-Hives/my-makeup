import { generateCookie, generatePayloadCookie, type Payload } from 'payload'
import { cookieEndOfLife, readExpiration } from './session-state'

/**
 * The session cookie of a makeup artist, as `cookies().set` and `NextResponse.cookies.set` take it.
 * No `next` import: the `pros` collection (loaded by the Payload CLI and the scripts too) builds the
 * cookie of a renewal with it (ticket 223), and `set-session-cookie.ts` builds the one of a sign-in.
 */
export interface SessionCookie {
	name: string
	value: string
	domain?: string
	expires?: Date
	httpOnly: true
	sameSite: 'lax' | 'strict' | 'none'
	secure: boolean
}

type CollectionAuth = Payload['collections']['pros']['config']['auth']

/**
 * The cookie of a token: HttpOnly, SameSite=Lax, Secure on the deployed site. It outlives its token
 * by `COOKIE_SURVIVAL_AFTER_END_S`, so that a visitor whose session ended is told so (ticket 080):
 * the one rule for the sign-in and for the sliding renewal (ticket 223).
 * `fin` is the end date of the token (Unix seconds) when the caller knows it, else it is read from the token.
 */
export function sessionCookieFor(
	auth: CollectionAuth,
	cookiePrefix: string,
	token: string,
	fin?: number
): SessionCookie {
	const cookie = generatePayloadCookie({
		collectionAuthConfig: auth,
		cookiePrefix,
		returnCookieAsObject: true,
		token,
	})
	const tokenEnd = fin ?? readExpiration(token)
	const expires =
		tokenEnd === null ? (cookie.expires ? new Date(cookie.expires) : undefined) : cookieEndOfLife(tokenEnd)
	return {
		name: cookie.name,
		value: token,
		domain: auth.cookies.domain,
		expires,
		httpOnly: true,
		sameSite: typeof auth.cookies.sameSite === 'string' ? (auth.cookies.sameSite.toLowerCase() as 'lax') : 'lax',
		secure: auth.cookies.secure || false,
	}
}

/** The same cookie as a `Set-Cookie` header value, for a response Payload builds itself. */
export function setCookieHeader(cookie: SessionCookie): string {
	return generateCookie<string>({
		name: cookie.name,
		domain: cookie.domain,
		expires: cookie.expires,
		httpOnly: true,
		path: '/',
		sameSite: cookie.sameSite === 'lax' ? 'Lax' : cookie.sameSite === 'strict' ? 'Strict' : 'None',
		secure: cookie.secure,
		returnCookieAsObject: false,
		value: cookie.value,
	})
}
