import { cookies } from 'next/headers'
import { generatePayloadCookie, type Payload } from 'payload'

/**
 * Puts the session token of a makeup artist in its cookie: HttpOnly, SameSite=Lax, Secure on the
 * deployed site, for as long as the session lasts. The one place that does it, for the sign-in and
 * for a sign-up that signs in at once. Server Actions only.
 */
export async function poserLeCookieDeSession(payload: Payload, token: string): Promise<void> {
	const auth = payload.collections.pros.config.auth
	const cookie = generatePayloadCookie({
		collectionAuthConfig: auth,
		cookiePrefix: payload.config.cookiePrefix,
		returnCookieAsObject: true,
		token,
	})
	;(await cookies()).set(cookie.name, token, {
		domain: auth.cookies.domain,
		expires: cookie.expires ? new Date(cookie.expires) : undefined,
		httpOnly: true,
		sameSite: typeof auth.cookies.sameSite === 'string' ? (auth.cookies.sameSite.toLowerCase() as 'lax') : 'lax',
		secure: auth.cookies.secure || false,
	})
}
