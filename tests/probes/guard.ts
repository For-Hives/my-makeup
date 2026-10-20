/**
 * The guard of the probes (R01, plan 02 §7.6): the only way a probe reaches a site.
 *
 * The probes are the one exception to « nothing goes to the live site » (CLAUDE.md, rule 5).
 * Every request they make goes through `garder()`, which lets a read through and nothing else:
 *  - GET only: any other method is interrupted before it leaves this machine;
 *  - nothing under `/u`, where the site relays its audience measurement (Umami's script and
 *    the sending of events, docs/migration/URLS.md): a probe is never counted as a visit;
 *  - nothing to another origin than the target, Umami's own included;
 *  - anonymous: no cookie, no `Authorization` header;
 *  - redirects are never followed: a probe reads the first answer, and a redirect can lead
 *    to another host or to `/u`.
 *
 * The transport only ever receives what the guard builds: a URL on the target and a GET with
 * the headers it allows. A refused request throws `RequeteInterdite`, and the run stops
 * (tests/probes/probes.ts).
 *
 * The guard of the end-to-end tests (tests/support/environment-guard.ts) is another guard,
 * which this file neither imports nor relaxes: it refuses production, always (U86).
 */

/** Thrown before a request leaves: it is not a read, or it goes where a probe never goes. */
export class ForbiddenRequest extends Error {
	override name = 'RequeteInterdite'
}

/** Thrown when the target of a run is not an address the probes may read. */
export class RefusedTarget extends Error {
	override name = 'CibleRefusee'
}

/** What actually sends a request: `fetch` for a run, a recorder for the self-check of R01. */
export type Transport = (adresse: URL, init: RequestInit) => Promise<Response>

/** A function shaped like `fetch`: whatever a probe asks for, the guard decides. */
export type GuardedReading = (entree: string | URL | Request, init?: RequestInit) => Promise<Response>

/** The only method that passes. */
export const READING_METHOD = 'GET'

/** Where the site relays its audience measurement: `/u/script.js`, `/u/api/send`, and the rest of `/u`. */
export const ANALYTICS_PATH = '/u'

/** Headers that would make the probe someone: a probe reads as an anonymous visitor. */
const IDENTITY_HEADERS = ['authorization', 'cookie'] as const

/**
 * The one address that takes the service token (R02, ticket 156): the weekly statistics, a read of
 * aggregates behind a token of the service. A token is never sent anywhere else, and never to
 * another host than the target. The token is the only identity a probe may carry.
 */
export const STATS_PATH = '/api/stats/weekly'

/** Hosts a run may read in plain HTTP: this machine (the bench, ticket 156). */
const HOST_LOCAL = ['localhost', '127.0.0.1', '[::1]']

/** The probe says what it is, so that its requests can be told apart in the logs of the site. */
export const PROBE_AGENT = 'my-makeup-sondes/1 (lecture seule)'

const transportReal: Transport = (adresse, init) => fetch(adresse, init)

/**
 * The origin a run reads: an `https` address, or `http` on this machine. Only an origin: a
 * path, a query string, a fragment or credentials in it are refused rather than dropped.
 */
export function probeTarget(valeur: string): URL {
	const url = URL.canParse(valeur) ? new URL(valeur) : undefined
	if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:'))
		throw new RefusedTarget('PROBES_TARGET doit être une adresse web, comme https://my-makeup.fr.')
	if (url.protocol === 'http:' && !HOST_LOCAL.includes(url.hostname))
		throw new RefusedTarget(
			`PROBES_TARGET refusée (hôte « ${url.hostname} ») : en http, seul ce poste est lu. Un site en ligne se lit en https.`
		)
	if (url.username || url.password || url.pathname !== '/' || url.search || url.hash)
		throw new RefusedTarget(
			'PROBES_TARGET doit être une origine seule, comme https://my-makeup.fr : sans chemin, sans paramètre et sans identifiant.'
		)
	return new URL(url.origin)
}

/** The path as the server may read it: decoded when it can be, without repeated slashes. */
function readPaths(url: URL): string[] {
	let decode = url.pathname
	try {
		decode = decodeURIComponent(url.pathname)
	} catch {
		// A malformed escape is checked as written.
	}
	return [url.pathname, decode].map(chemin => chemin.replace(/\/{2,}/g, '/'))
}

const toAnalytics = (url: URL): boolean =>
	readPaths(url).some(chemin => chemin === ANALYTICS_PATH || chemin.startsWith(`${ANALYTICS_PATH}/`))

/**
 * What the guard lets through, or `RequeteInterdite`. Exported for the tests: a probe calls
 * the function `garder()` returns, never the transport.
 */
export function checkRequest(
	entree: string | URL | Request,
	init: RequestInit,
	cible: URL,
	jeton?: string
): { adresse: URL; entetes: Headers } {
	const request = entree instanceof Request ? entree : undefined
	const method = (init.method ?? request?.method ?? READING_METHOD).toUpperCase()
	if (method !== READING_METHOD)
		throw new ForbiddenRequest(
			`Requête ${method} interrompue : une sonde ne fait que lire (${READING_METHOD}), elle n’écrit jamais sur le site.`
		)
	if (init.body !== undefined && init.body !== null)
		throw new ForbiddenRequest('Requête interrompue : une lecture ne porte pas de corps.')

	const address = request ? new URL(request.url) : new URL(entree instanceof URL ? entree.href : String(entree), cible)
	if (address.origin !== cible.origin)
		throw new ForbiddenRequest(
			`Requête interrompue vers « ${address.host} » : une sonde ne lit que la cible (${cible.host}).`
		)
	if (toAnalytics(address))
		throw new ForbiddenRequest(
			`Requête interrompue vers ${ANALYTICS_PATH}… : la mesure d’audience est bloquée, une sonde n’est jamais comptée comme une visite.`
		)

	const headers = new Headers(init.headers ?? request?.headers)
	for (const name of IDENTITY_HEADERS) {
		if (!headers.has(name)) continue
		// The token of the service, to the statistics route only: anything else about identity stays refused.
		const serviceToken =
			name === 'authorization' &&
			jeton !== undefined &&
			address.pathname === STATS_PATH &&
			headers.get('authorization') === `Bearer ${jeton}`
		if (!serviceToken)
			throw new ForbiddenRequest(
				`Requête interrompue : l’en-tête « ${name} » ferait de la sonde quelqu’un. Une sonde lit comme une visiteuse anonyme.`
			)
	}
	if (!headers.has('user-agent')) headers.set('user-agent', PROBE_AGENT)
	return { adresse: address, entetes: headers }
}

/**
 * The guarded reader of a target: a function shaped like `fetch` that hands the transport a GET
 * on the target, or throws `RequeteInterdite` without calling it.
 */
export function keep(cible: URL, transport: Transport = transportReal, jeton?: string): GuardedReading {
	return async (entree, init = {}) => {
		const { adresse: address, entetes: headers } = checkRequest(entree, init, cible, jeton)
		return transport(address, {
			method: READING_METHOD,
			headers: headers,
			redirect: 'manual',
			...(init.signal ? { signal: init.signal } : {}),
		})
	}
}
