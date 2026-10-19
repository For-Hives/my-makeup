import { expiredSessionUrl, signInUrl } from './return-to'
import { tokenState } from './session-state'

/** The name of Payload's session cookie (`<cookiePrefix>-token`, prefix `payload` by default). */
export const SESSION_COOKIE = 'payload-token'

/** The private pages of the space. Their sub-paths are private too. */
export const PRIVATE_PAGES = ['/auth/profil', '/auth/apercu-profil', '/auth/init-account'] as const

export const isPrivatePage = (chemin: string): boolean =>
	PRIVATE_PAGES.some(page => chemin === page || chemin.startsWith(`${page}/`))

/**
 * What the proxy does with a request for the space: the sign-in page that brings the visitor back
 * (one redirection), or nothing. It looks at the presence of the cookie only: it is the quick,
 * optimistic gate. Whether the token is valid is decided by the page itself, with the same rule as
 * the sign-in page (`signedInArtist`), so a stale cookie ends on the sign-in form after one
 * redirection and never loops.
 */
export function dashboardRedirection(chemin: string, recherche: string, aLeCookie: boolean): string | null {
	if (!isPrivatePage(chemin) || aLeCookie) return null
	return signInUrl(`${chemin}${recherche}`)
}

/**
 * The proxy's whole decision for a request, from the session cookie's value (ticket 080): the
 * sign-in page to redirect to, or nothing.
 * - No cookie: the sign-in page, without a message.
 * - A cookie whose end date has passed: the sign-in page with the « session expirée » message. No
 *   database is read, so it holds when the database is down. The cookie is left alone on purpose: a
 *   browser may replay the request (Critical-CH) before it reads the answer, and a cookie deleted
 *   by the first answer would turn the replay into a redirection without the message. The sign-in
 *   page does not redirect on an expired cookie, so it loops on nothing, and the next sign-in
 *   replaces it.
 * - Any other cookie: nothing, the page decides (it is the one that asks Payload).
 * - A request that is not a GET or HEAD (a Server Action): nothing, whatever the cookie (ticket 121).
 */
export function dashboardDecision(
	chemin: string,
	recherche: string,
	jeton: string | undefined,
	maintenantS: number,
	methode = 'GET'
): string | null {
	if (!isPrivatePage(chemin)) return null
	// A save is a POST (a Server Action): a redirection would swallow it and the form would lose
	// what was typed (ticket 121). The action reads the session again and answers « expired » itself.
	if (methode !== 'GET' && methode !== 'HEAD') return null
	if (tokenState(jeton, maintenantS) === 'expire') return expiredSessionUrl(`${chemin}${recherche}`)
	return dashboardRedirection(chemin, recherche, jeton !== undefined && jeton !== '')
}
