/**
 * How long the two links of the mail stay good: 24 hours (ticket 311, decision of 22/10/2026, which
 * brings the link of a forgotten password to the length of the confirmation link; it was one hour).
 * The one setting both read:
 * - the link of a forgotten password (`LINK_DURATION_MS`, the expiration Payload stores and the cookie
 *   of the page `/auth/reinitialiser`);
 * - the session the confirmation link can open (`SESSION_OFFER_WINDOW_MS`, counted from the creation
 *   of the account, and the cookie of the confirmation page).
 * Each link stays single-use. Pure: no import, so the proxy, the collections and the tests can share it.
 */
export const MAIL_LINK_WINDOW_MS = 24 * 60 * 60 * 1000

/** The same window as the words of the texts: « 24 heures ». */
export const MAIL_LINK_WINDOW_WORDS = '24 heures'
