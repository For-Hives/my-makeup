import { urlDeConnexion } from './retour'

/** The name of Payload's session cookie (`<cookiePrefix>-token`, prefix `payload` by default). */
export const COOKIE_DE_SESSION = 'payload-token'

/** The private pages of the space. Their sub-paths are private too. */
export const PAGES_PRIVEES = ['/auth/profil', '/auth/init-account'] as const

export const estPagePrivee = (chemin: string): boolean =>
	PAGES_PRIVEES.some(page => chemin === page || chemin.startsWith(`${page}/`))

/**
 * What the proxy does with a request for the space: the sign-in page that brings the visitor back
 * (one redirection), or nothing. It looks at the presence of the cookie only: it is the quick,
 * optimistic gate. Whether the token is valid is decided by the page itself, with the same rule as
 * the sign-in page (`maquilleuseConnectee`), so a stale cookie ends on the sign-in form after one
 * redirection and never loops.
 */
export function redirectionDeLEspace(chemin: string, recherche: string, aLeCookie: boolean): string | null {
	if (!estPagePrivee(chemin) || aLeCookie) return null
	return urlDeConnexion(`${chemin}${recherche}`)
}
