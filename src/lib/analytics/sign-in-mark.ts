/**
 * The mark a successful sign-in leaves for the next page (ticket 146).
 *
 * A sign-in ends in a redirection (a Server Action for the password, the return route for Google),
 * so the page that sent the form is gone before it can say « it worked ». The server leaves a
 * short-lived cookie that only says by which method she came in; the next page reads it, spends
 * it, and sends `login_result` once. It holds no account, no address, no token: two words at most.
 * The cookie is readable by the page on purpose (not HttpOnly): that is the whole point of it.
 */

import type { MyMakeupEvents } from './events'

export const SIGN_IN_MARK_COOKIE = 'mm-sign-in-mark'

/** How long the mark waits for the next page, in seconds. */
export const MARK_LIFETIME_S = 120

export type SignInMethod = MyMakeupEvents['login_result']['method']

/** The attributes the server gives the cookie (`cookies().set` and `NextResponse.cookies.set` take them). */
export function markAttributes(production: boolean) {
	return { path: '/', maxAge: MARK_LIFETIME_S, sameSite: 'lax' as const, httpOnly: false, secure: production }
}

/** The method a cookie header holds, or nothing: only the two known words count. */
export function markMethod(cookies: string): SignInMethod | null {
	for (const part of cookies.split(';')) {
		const [name, value] = part.trim().split('=')
		if (name !== SIGN_IN_MARK_COOKIE) continue
		return value === 'email' || value === 'google' ? value : null
	}
	return null
}

/** The line that spends the mark in the browser. */
export const EXPIRED_MARK_COOKIE = `${SIGN_IN_MARK_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`
