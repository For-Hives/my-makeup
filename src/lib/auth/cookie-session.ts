import { cookies } from 'next/headers'
import { generatePayloadCookie, type Payload } from 'payload'
import { finDeVieDuCookie, lireExpiration } from './etat-session'

/** The session cookie of a makeup artist, as `cookies().set` and `NextResponse.cookies.set` take it. */
export interface CookieDeSession {
	name: string
	value: string
	domain?: string
	expires?: Date
	httpOnly: true
	sameSite: 'lax' | 'strict' | 'none'
	secure: boolean
}

/**
 * The session cookie of a makeup artist: HttpOnly, SameSite=Lax, Secure on the deployed site, for
 * as long as the session lasts. The one place that decides what it looks like, for a Server Action
 * (`poserLeCookieDeSession`) and for a route that answers with its own response (the return from
 * Google).
 */
export function cookieDeSession(payload: Payload, token: string): CookieDeSession {
	const auth = payload.collections.pros.config.auth
	const cookie = generatePayloadCookie({
		collectionAuthConfig: auth,
		cookiePrefix: payload.config.cookiePrefix,
		returnCookieAsObject: true,
		token,
	})
	// The cookie outlives its token, so that a visitor whose session ended is told so (ticket 080).
	const finDuJeton = lireExpiration(token)
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

/**
 * Puts the session token of a makeup artist in its cookie. The one place that does it, for the
 * sign-in and for a sign-up that signs in at once. Server Actions only.
 */
export async function poserLeCookieDeSession(payload: Payload, token: string): Promise<void> {
	const { name, value, ...attributs } = cookieDeSession(payload, token)
	;(await cookies()).set(name, value, attributs)
}
