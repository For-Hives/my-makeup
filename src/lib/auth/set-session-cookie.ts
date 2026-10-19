import { cookies } from 'next/headers'
import type { Payload } from 'payload'
import { type SessionCookie, sessionCookieFor } from './session-cookie'

export type { SessionCookie as CookieDeSession }

/**
 * The session cookie of a makeup artist: HttpOnly, SameSite=Lax, Secure on the deployed site, for
 * as long as the session lasts. The one place that decides what it looks like, for a Server Action
 * (`poserLeCookieDeSession`) and for a route that answers with its own response (the return from
 * Google). The rule itself is in `cookie-de-session.ts`, which the sliding renewal shares.
 */
export function sessionCookie(payload: Payload, token: string): SessionCookie {
	return sessionCookieFor(payload.collections.pros.config.auth, payload.config.cookiePrefix, token)
}

/**
 * Puts the session token of a makeup artist in its cookie. The one place that does it, for the
 * sign-in and for a sign-up that signs in at once. Server Actions only.
 */
export async function setSessionCookie(payload: Payload, token: string): Promise<void> {
	const { name, value, ...attributes } = sessionCookie(payload, token)
	;(await cookies()).set(name, value, attributes)
}
