import { generateCookie, generatePayloadCookie, type Payload } from 'payload'
import { finDeVieDuCookie, lireExpiration } from './session-state'

/**
 * The session cookie of a makeup artist, as `cookies().set` and `NextResponse.cookies.set` take it.
 * No `next` import: the `pros` collection (loaded by the Payload CLI and the scripts too) builds the
 * cookie of a renewal with it (ticket 223), and `cookie-session.ts` builds the one of a sign-in.
 */
export interface CookieDeSession {
	name: string
	value: string
	domain?: string
	expires?: Date
	httpOnly: true
	sameSite: 'lax' | 'strict' | 'none'
	secure: boolean
}

type AuthDeLaCollection = Payload['collections']['pros']['config']['auth']

/**
 * The cookie of a token: HttpOnly, SameSite=Lax, Secure on the deployed site. It outlives its token
 * by `SURVIE_DU_COOKIE_APRES_FIN_S`, so that a visitor whose session ended is told so (ticket 080):
 * the one rule for the sign-in and for the sliding renewal (ticket 223).
 * `fin` is the end date of the token (Unix seconds) when the caller knows it, else it is read from the token.
 */
export function cookieDeSessionDe(
	auth: AuthDeLaCollection,
	cookiePrefix: string,
	token: string,
	fin?: number
): CookieDeSession {
	const cookie = generatePayloadCookie({
		collectionAuthConfig: auth,
		cookiePrefix,
		returnCookieAsObject: true,
		token,
	})
	const finDuJeton = fin ?? lireExpiration(token)
	const expires =
		finDuJeton === null ? (cookie.expires ? new Date(cookie.expires) : undefined) : finDeVieDuCookie(finDuJeton)
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
export function enteteSetCookie(cookie: CookieDeSession): string {
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
