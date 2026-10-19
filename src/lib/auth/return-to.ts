/**
 * Where to go after signing in, and where a closed page sends a visitor (tickets 074 and 075).
 */

/** The page a makeup artist lands on after signing in. */
export const ESPACE_PAR_DEFAUT = '/auth/profil'

export const PAGE_DE_CONNEXION = '/auth/signin'

/** Pages and routes a sign-in must not send back to: they would loop, or are not pages. */
const PAGES_SANS_RETOUR = ['/auth/signin', '/auth/signup', '/auth/error', '/auth/google', '/api/']

/**
 * The page to come back to after signing in: the requested one when it is on this site, the
 * default otherwise (another site, `//host`, `/\host`, `javascript:`, an authentication page).
 * The value is parsed, not compared as text: every trick ends up with another origin.
 */
export function retourSur(brut: unknown, origine: string, defaut: string = ESPACE_PAR_DEFAUT): string {
	const valeur = Array.isArray(brut) ? brut[0] : brut
	if (typeof valeur !== 'string' || valeur.trim() === '') return defaut
	try {
		const base = new URL(origine)
		const url = new URL(valeur.trim(), base)
		if (url.origin !== base.origin) return defaut
		if (PAGES_SANS_RETOUR.some(page => url.pathname === page.replace(/\/$/, '') || url.pathname.startsWith(page)))
			return defaut
		const sortie = `${url.pathname}${url.search}${url.hash}`
		// A dot segment can leave a path that starts with `//` (`/.//host`): a browser reads it as another site.
		if (/^[/\\]{2}/.test(sortie) || new URL(sortie, base).origin !== base.origin) return defaut
		return sortie
	} catch {
		return defaut
	}
}

/** The sign-in page that brings the visitor back to `chemin` (path and query of the closed page). */
export const urlDeConnexion = (chemin: string): string =>
	`${PAGE_DE_CONNEXION}?callbackUrl=${encodeURIComponent(chemin)}`

/** Where a sign-out leads: the home page, public and always there (AUTH-07: it was a 404). */
export const PAGE_APRES_DECONNEXION = '/'

/** The wall of verification: the page that tells a new account to look in its mailbox (ticket 082). */
export const PAGE_DU_MUR = '/auth/verification-wall'

/** The onboarding: where a new, confirmed and signed-in account lands (ticket 082). */
export const PAGE_D_ACCUEIL_DU_COMPTE = '/auth/init-account'

/** The `error` of the sign-in page that says the session ended. The only code of the address that is ever shown. */
export const ERREUR_SESSION_EXPIREE = 'session-expiree'

/** The sign-in page that says the session ended, and brings the visitor back to `chemin` (one redirection). */
export const urlSessionExpiree = (chemin: string): string => `${urlDeConnexion(chemin)}&error=${ERREUR_SESSION_EXPIREE}`
