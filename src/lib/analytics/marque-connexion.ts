/**
 * The mark a successful sign-in leaves for the next page (ticket 146).
 *
 * A sign-in ends in a redirection (a Server Action for the password, the return route for Google),
 * so the page that sent the form is gone before it can say « it worked ». The server leaves a
 * short-lived cookie that only says by which method she came in; the next page reads it, spends
 * it, and sends `login_result` once. It holds no account, no address, no token: two words at most.
 * The cookie is readable by the page on purpose (not HttpOnly): that is the whole point of it.
 */

import type { EvenementsMyMakeup } from './events'

export const COOKIE_DE_MARQUE_DE_CONNEXION = 'mm-connexion'

/** How long the mark waits for the next page, in seconds. */
export const VIE_DE_LA_MARQUE_S = 120

export type MethodeDeConnexion = EvenementsMyMakeup['login_result']['method']

/** The attributes the server gives the cookie (`cookies().set` and `NextResponse.cookies.set` take them). */
export function attributsDeLaMarque(production: boolean) {
	return { path: '/', maxAge: VIE_DE_LA_MARQUE_S, sameSite: 'lax' as const, httpOnly: false, secure: production }
}

/** The method a cookie header holds, or nothing: only the two known words count. */
export function methodeDeLaMarque(cookies: string): MethodeDeConnexion | null {
	for (const morceau of cookies.split(';')) {
		const [nom, valeur] = morceau.trim().split('=')
		if (nom !== COOKIE_DE_MARQUE_DE_CONNEXION) continue
		return valeur === 'email' || valeur === 'google' ? valeur : null
	}
	return null
}

/** The line that spends the mark in the browser. */
export const COOKIE_DE_MARQUE_PERIME = `${COOKIE_DE_MARQUE_DE_CONNEXION}=; Max-Age=0; Path=/; SameSite=Lax`
