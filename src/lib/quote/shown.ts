/**
 * Whether a profile shows the quote form (issue 1003). One rule, read by the page of the profile and by the
 * server when a request arrives (the page may be kept in the cache for an hour, so the server never trusts it
 * was shown):
 * - the switch of the site is on (`QUOTE_REQUESTS`, README);
 * - the profile shows a way to reach the artist (a network, a site, or a telephone or email she chose to show):
 *   the same rule as the button « Contacter » and as « Coordonnées pas encore indiquées » (ticket 291);
 * - she is not on pause (« Reprendre les demandes », ticket 292).
 *
 * - the profile is published: a draft page (an almost empty profile) is served too, with a noindex tag, and takes no request.
 */
export function quoteFormShown({
	enabled,
	published,
	reachable,
	available,
}: {
	enabled: boolean
	published: boolean
	reachable: boolean
	available: boolean
}): boolean {
	return enabled && published && reachable && available
}
