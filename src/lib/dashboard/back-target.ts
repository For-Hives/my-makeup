import { DEFAULT_DASHBOARD } from '../auth/return-to'

/**
 * Where the back arrow of her space leads (27/10/2026): one rule, read by the arrow and tested alone.
 *
 * - The page of her space that has a parent (the preview and the edit mode of her page, `/auth/apercu-profil`) leads
 *   to the home of her space, `/auth/profil`. A fixed destination, never « the previous page »: a history that goes back
 *   would send her to the sign-in form after a sign-in, or round and round between the preview and the edit mode.
 * - The home of her space has nowhere to go back to inside the space: no arrow (it would lead to itself, a loop).
 * - Every other page (sign-in, sign-up, confirmation, public site) has no arrow.
 */
const PAGES_WITH_BACK_ARROW = ['/auth/apercu-profil'] as const

/** The path an arrow leads to from this page, or `null` when the page shows no arrow. `pathname` has no query. */
export function backTarget(pathname: string): string | null {
	const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
	const inSpace = PAGES_WITH_BACK_ARROW.some(page => path === page || path.startsWith(`${page}/`))
	return inSpace ? DEFAULT_DASHBOARD : null
}
