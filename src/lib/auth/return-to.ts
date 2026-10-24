import { formerPreviewTarget } from '../direct-edit/edit-mode'

/**
 * Where to go after signing in, and where a closed page sends a visitor (tickets 074 and 075).
 */

/** The page a makeup artist lands on after signing in. */
export const DEFAULT_DASHBOARD = '/auth/profil'

export const SIGN_IN_PAGE = '/auth/signin'

/** Pages and routes a sign-in must not send back to: they would loop, or are not pages. */
const PAGES_WITHOUT_RETURN_TO = ['/auth/signin', '/auth/signup', '/auth/error', '/auth/google', '/api/']

/**
 * The page to come back to after signing in: the requested one when it is on this site, the
 * default otherwise (another site, `//host`, `/\host`, `javascript:`, an authentication page).
 * The value is parsed, not compared as text: every trick ends up with another origin.
 */
export function safeReturnTo(brut: unknown, origine: string, defaut: string = DEFAULT_DASHBOARD): string {
	const value = Array.isArray(brut) ? brut[0] : brut
	if (typeof value !== 'string' || value.trim() === '') return defaut
	try {
		const base = new URL(origine)
		const url = new URL(value.trim(), base)
		if (url.origin !== base.origin) return defaut
		if (PAGES_WITHOUT_RETURN_TO.some(page => url.pathname === page.replace(/\/$/, '') || url.pathname.startsWith(page)))
			return defaut
		// The former address of the preview goes straight to its successor (issue 1022): no hop after the sign-in.
		const moved = formerPreviewTarget(url.pathname, url.searchParams.get('mode'))
		const output = moved ?? `${url.pathname}${url.search}${url.hash}`
		// A dot segment can leave a path that starts with `//` (`/.//host`): a browser reads it as another site.
		if (/^[/\\]{2}/.test(output) || new URL(output, base).origin !== base.origin) return defaut
		return output
	} catch {
		return defaut
	}
}

/**
 * Where a successful sign-in leads (ticket 296). A makeup artist who asked for no precise page (none, or
 * her space itself, which is what a closed page of her space asks for) and whose onboarding is not
 * done lands on the onboarding, so a profile still empty is offered the three steps. A precise page
 * (a private page other than her space) is always respected: nothing is forced against a link.
 */
export function destinationAfterSignIn(returnTo: string, onboardingToDo: boolean): string {
	return returnTo === DEFAULT_DASHBOARD && onboardingToDo ? ACCOUNT_ONBOARDING_PAGE : returnTo
}

/** The sign-in page that brings the visitor back to `chemin` (path and query of the closed page). */
export const signInUrl = (chemin: string): string => `${SIGN_IN_PAGE}?callbackUrl=${encodeURIComponent(chemin)}`

/** Where a sign-out leads: the home page, public and always there (AUTH-07: it was a 404). */
export const PAGE_AFTER_SIGN_OUT = '/'

/** The wall of verification: the page that tells a new account to look in its mailbox (ticket 082). */
export const VERIFICATION_WALL_PAGE = '/auth/verification-wall'

/** The onboarding: where a new, confirmed and signed-in account lands (ticket 082). */
export const ACCOUNT_ONBOARDING_PAGE = '/auth/init-account'

/** The `error` of the sign-in page that says the session ended. The only code of the address that is ever shown. */
export const EXPIRED_SESSION_ERROR = 'session-expiree'

/** The sign-in page that says the session ended, and brings the visitor back to `chemin` (one redirection). */
export const expiredSessionUrl = (chemin: string): string => `${signInUrl(chemin)}&error=${EXPIRED_SESSION_ERROR}`
