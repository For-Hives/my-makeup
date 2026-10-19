/**
 * The brake on the search (ticket 100; plan 02 I30): 60 searches a minute from one address, then a 429
 * in French until the minute has passed. It is the brick of ticket 076 (`createRateLimit`, `ipClient`), with
 * its own counters, played by the proxy: a page of the App Router cannot answer 429.
 *
 * - Only the search page is counted. The home page, the profiles and everything else are cached or
 *   cheap and are never braked, whatever the address has done.
 * - Only a GET or HEAD counts, and a prefetch of the browser does not (the links of the pages do not
 *   prefetch, but a client navigation may).
 * - A request that did not come through the proxy of the site is never braked: development, the test
 *   bench and the end-to-end tests reach the server directly. It has no `X-Forwarded-For` (`local`), or
 *   Next wrote its own address there, a loopback one (`127.0.0.1`, `::1`): no visitor has such an address
 *   behind Traefik, which writes the real one.
 * - The address is a key to count, never a line of a log.
 *
 * No `next` import: read by the proxy and by the tests.
 */

import { ipClient, NO_PROXY } from '@/lib/auth/client-ip'
import { createRateLimit, type RateLimit } from '@/lib/auth/rate-limit'

export const RECHERCHES_PAR_MINUTE = 60

export const freinDeRecherche: RateLimit = createRateLimit({
	nom: 'recherche',
	limite: RECHERCHES_PAR_MINUTE,
	fenetreMs: 60_000,
})

export const CHEMIN_DE_LA_RECHERCHE = '/search'

/** The key of a loopback address, as `ipClient` gives it: `127.x.y.z`, or the /64 block of `::1`. */
export const estUneAdresseLocale = (cle: string): boolean =>
	cle === NO_PROXY || cle.startsWith('127.') || cle === '0:0:0:0::/64'

/** The page that answers a braked address: plain HTML, in French, with a way back. */
export function pageDeFrein(reessayerDansS: number): string {
	return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Trop de recherches</title>
</head>
<body style="font-family: system-ui, sans-serif; max-width: 36rem; margin: 4rem auto; padding: 0 1rem; color: #1f2937">
<h1>Trop de recherches en peu de temps</h1>
<p>Vous avez lancé beaucoup de recherches à la suite. Patientez environ ${reessayerDansS} seconde${reessayerDansS > 1 ? 's' : ''}, puis réessayez.</p>
<p><a href="/">Revenir à l’accueil</a></p>
</body>
</html>
`
}

/**
 * Takes a place for this search; `null` when it may go on, else the 429 to answer (body, headers).
 * `frein` is the brake to use, the shared one by default.
 */
export function freinerLaRecherche(
	{ chemin, methode, entetes }: { chemin: string; methode: string; entetes: Headers },
	frein: RateLimit = freinDeRecherche
): { status: 429; corps: string; entetes: Record<string, string> } | null {
	if (chemin !== CHEMIN_DE_LA_RECHERCHE) return null
	if (methode !== 'GET' && methode !== 'HEAD') return null
	if (entetes.has('next-router-prefetch') || entetes.get('purpose') === 'prefetch') return null
	const cle = ipClient(entetes)
	if (estUneAdresseLocale(cle)) return null
	const decision = frein.prendre(cle)
	if (decision.autorise) return null
	return {
		status: 429,
		corps: pageDeFrein(decision.reessayerDansS),
		entetes: {
			'Content-Type': 'text/html; charset=utf-8',
			'Retry-After': String(decision.reessayerDansS),
			'Cache-Control': 'no-store',
		},
	}
}
