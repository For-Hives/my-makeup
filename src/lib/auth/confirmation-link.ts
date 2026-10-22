import type { LinkPlan } from './forgot-password'

/**
 * The link of the confirmation mail and the session it can open (ticket 302). Pure: the proxy, the
 * page and the tests share it. No `next` import, no Payload.
 *
 * - The link (`/auth/verification-complete?code=…`) is moved into a cookie of that page by the proxy,
 *   as the link of a forgotten password is: the code never stays in the address, the history, a
 *   Referer or the audience measurement. Only a code of our shape is kept.
 * - Following the link confirms the address (as before) but opens no session: a mail reader that
 *   fetches the link first would get it. The session opens on the click of « Continuer », for the one
 *   who holds the code, once, and only while the account is recent: the token Payload made has no date of
 *   its own, so the window is counted from the creation of the account (a resent mail carries the same
 *   token, and a late one therefore confirms the address and opens nothing).
 */

export const CONFIRMATION_PAGE = '/auth/verification-complete'

/** The cookie of that page alone that holds the code between the link and the click. */
export const CONFIRMATION_COOKIE = 'mm-confirm'

/**
 * How long after the creation of the account the link can still open a session: 24 hours (ticket 311,
 * decision of 22/10/2026; ticket 302 had one hour). The link stays single-use and behind a click; the
 * window is the one setting to change. The link of a forgotten password keeps its own hour
 * (`LINK_DURATION_MS`).
 */
export const SESSION_OFFER_WINDOW_MS = 24 * 60 * 60 * 1000

/** The token Payload makes for a confirmation: 20 random bytes in hexadecimal. */
export const CONFIRMATION_TOKEN = /^[0-9a-f]{40}$/

/** What the proxy does with a request for the page of the link: the cookie to set or to clear, and where to go. */
export function confirmationLinkPlan(chemin: string, parametres: URLSearchParams): LinkPlan | null {
	if (chemin !== CONFIRMATION_PAGE || !parametres.has('code')) return null
	const code = parametres.get('code')?.trim() ?? ''
	return CONFIRMATION_TOKEN.test(code)
		? { aller: CONFIRMATION_PAGE, cookie: { valeur: code, maxAgeS: SESSION_OFFER_WINDOW_MS / 1000 } }
		: { aller: CONFIRMATION_PAGE, cookie: { valeur: '', maxAgeS: 0 } }
}

/** Whether an account created at `creeLe` is still inside the window of the session of the link. A missing or unreadable date closes it. */
export function sessionOfferOpen(creeLe: string | Date | null | undefined, maintenantMs: number): boolean {
	if (!creeLe) return false
	const created = new Date(creeLe).getTime()
	return Number.isFinite(created) && maintenantMs - created < SESSION_OFFER_WINDOW_MS
}
