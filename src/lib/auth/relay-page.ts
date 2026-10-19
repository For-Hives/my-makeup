/**
 * The relay page (tickets 091 and 223): a short page that sends the browser on to `chemin` by itself.
 *
 * Not a redirection, on purpose. A browser that arrives from another site (the return from Google, a
 * link in a mail) keeps the whole chain « cross-site » (`Sec-Fetch-Site`) through a redirection, and
 * Payload ignores a session cookie on a cross-site request that carries no `Origin`: the first page
 * of the space would take her for signed out. A navigation that a page of this site starts is
 * « same-origin », and the cookie counts. No script is needed.
 *
 * No `next` import: the return from Google and the proxy both answer with it.
 */

/** The header the relay and the proxy are about. */
export const FETCH_SITE_HEADER = 'sec-fetch-site'

const escapeHtml = (texte: string): string =>
	texte.replace(
		/[&<>"']/g,
		lettre => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[lettre] ?? lettre
	)

/** The HTML of the relay page that continues to `chemin` (a path of this site, with its query). */
export function relayPage(chemin: string): string {
	const target = escapeHtml(chemin)
	return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${target}"><title>Connexion en cours</title></head><body><p>Connexion en cours… <a href="${target}">Continuer</a></p></body></html>`
}

/** The headers of the relay page: never kept by a cache, whoever it is shared with. */
export const RELAY_HEADERS = {
	'Content-Type': 'text/html; charset=utf-8',
	'Cache-Control': 'private, no-store',
} as const

/** True for a navigation that another site started: the session cookie would be ignored by Payload. */
export const comesFromOtherSite = (entetes: { get(nom: string): string | null }): boolean =>
	entetes.get(FETCH_SITE_HEADER) === 'cross-site'
