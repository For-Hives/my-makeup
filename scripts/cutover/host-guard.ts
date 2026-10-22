/**
 * The guard of the check of a host (ticket 173, docs/tests/controle-hote.md): the only way the
 * command reaches a host.
 *
 * It lets a read through and nothing else:
 *  - GET only, without a body: any other method is interrupted before it leaves this machine;
 *  - the target only: any other origin is interrupted;
 *  - under `/u`, where the site relays its audience measurement, the four addresses the frozen
 *    inventory names and no other (`/u`, `/u/script.js`, `/u/api/send`, `/u/autre-chemin`), without
 *    a query: a GET records no event, which is a POST; the control never sends one;
 *  - anonymous: no cookie, and no `Authorization` of the caller. The one identity is the protected
 *    access of the temporary production host, set once by the command and sent to that host only;
 *  - no redirect is followed: one could lead to another host or to `/u`.
 *
 * No dependency, `fetch` only: the CI runs the command without `bun install`, next to the secrets.
 */

/** Thrown before a request leaves: it is not a read, or it goes where the check never goes. */
export class ForbiddenQuery extends Error {
	override name = 'RequeteInterdite'
}

/** Thrown when the target of a run is not an address the command may read. */
export class TargetRefused extends Error {
	override name = 'CibleRefusee'
}

/** What actually sends a request: `fetch` for a run, a recorder for the tests. */
export type Transport = (adresse: URL, init: RequestInit) => Promise<Response>

/** A function shaped like `fetch`, which a run calls with a path of the target. */
export type GuardedRead = (chemin: string, init?: RequestInit) => Promise<Response>

export const READ_METHOD = 'GET'

/** Where the site relays its audience measurement. */
export const ANALYTICS_PATH = '/u'

/** The script of the measurement, served by the site. */
export const ANALYTICS_SCRIPT_PATH = '/u/script.js'

/** The only addresses under `/u` that are read: the ones of the frozen inventory (URLS.md, « Mesure »). */
export const READ_PATHS_UNDER_ANALYTICS: readonly string[] = [
	ANALYTICS_PATH,
	ANALYTICS_SCRIPT_PATH,
	'/u/api/send',
	'/u/autre-chemin',
]

/** The site itself: the main production host. The protected access is never sent there. */
export const MAIN_HOST = 'my-makeup.fr'

/**
 * The temporary host of the new site before the domains are swapped (PLAN-PROD-DIRECT.md): the same
 * production application, behind a protected access. The only host that takes the protected access.
 */
export const TEMPORARY_HOST = 'v3.my-makeup.fr'

/** The hosts of production a run may read online. There is no other online host: no staging environment (ticket 232). */
export const PRODUCTION_HOSTS: readonly string[] = [MAIN_HOST, TEMPORARY_HOST]

/** The check says what it is, so that its requests can be told apart in the logs of the site. */
export const CHECK_AGENT = 'my-makeup-controle-hote/1 (lecture seule)'

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']

const realTransport: Transport = (adresse, init) => fetch(adresse, init)

/**
 * The origin a run reads: an `https` address, or `http` on this machine. Only an origin: a path, a
 * query string, a fragment or credentials in it are refused rather than dropped.
 */
export function checkTarget(valeur: string): URL {
	const url = URL.canParse(valeur) ? new URL(valeur) : undefined
	if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:'))
		throw new TargetRefused('HOST_CHECK_TARGET doit être une adresse web, comme https://my-makeup.fr.')
	if (url.protocol === 'http:' && !LOCAL_HOSTS.includes(url.hostname))
		throw new TargetRefused(
			`HOST_CHECK_TARGET refusée (hôte « ${url.hostname} ») : en http, seul ce poste est lu. Un hôte en ligne se lit en https.`
		)
	if (url.protocol === 'https:' && !PRODUCTION_HOSTS.includes(url.hostname))
		throw new TargetRefused(
			`HOST_CHECK_TARGET refusée (hôte « ${url.hostname} ») : le contrôle ne lit que la production, ${PRODUCTION_HOSTS.map(hote => `https://${hote}`).join(' ou ')}, ou le banc de ce poste. La v3 n’a qu’un environnement en ligne.`
		)
	if (url.username || url.password || url.pathname !== '/' || url.search || url.hash)
		throw new TargetRefused(
			'HOST_CHECK_TARGET doit être une origine seule, comme https://my-makeup.fr : sans chemin, sans paramètre et sans identifiant.'
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

/** True when the request goes under `/u` for anything else than the inventory addresses, read as a GET. */
const toAnalytics = (url: URL): boolean => {
	const paths = readPaths(url)
	const underAnalytics = paths.some(chemin => chemin === ANALYTICS_PATH || chemin.startsWith(`${ANALYTICS_PATH}/`))
	return underAnalytics && !(READ_PATHS_UNDER_ANALYTICS.includes(url.pathname) && url.search === '')
}

/**
 * What the guard lets through, or `RequeteInterdite`. `chemin` is written after the origin as it
 * stands (`//x` is a path of the site, not a host).
 */
export function checkQuery(
	chemin: string,
	init: RequestInit,
	cible: URL,
	autorisation?: string
): { adresse: URL; entetes: Headers } {
	const method = (init.method ?? READ_METHOD).toUpperCase()
	if (method !== READ_METHOD)
		throw new ForbiddenQuery(
			`Requête ${method} interrompue : le contrôle ne fait que lire (${READ_METHOD}), il n’écrit jamais sur l’hôte.`
		)
	if (init.body !== undefined && init.body !== null)
		throw new ForbiddenQuery('Requête interrompue : une lecture ne porte pas de corps.')
	if (!chemin.startsWith('/'))
		throw new ForbiddenQuery(
			'Requête interrompue : une adresse se lit sur la cible, par un chemin qui commence par « / ».'
		)

	const address = new URL(`${cible.origin}${chemin}`)
	if (address.origin !== cible.origin)
		throw new ForbiddenQuery(
			`Requête interrompue vers « ${address.host} » : le contrôle ne lit que la cible (${cible.host}).`
		)
	if (toAnalytics(address))
		throw new ForbiddenQuery(
			`Requête interrompue vers ${ANALYTICS_PATH}… : seules les adresses de l’inventaire sous ${ANALYTICS_PATH} se lisent, le contrôle n’est jamais compté comme une visite.`
		)

	const headers = new Headers(init.headers)
	for (const name of ['authorization', 'cookie'])
		if (headers.has(name))
			throw new ForbiddenQuery(
				`Requête interrompue : l’en-tête « ${name} » ferait du contrôle quelqu’un. Il lit comme une visiteuse anonyme.`
			)
	if (autorisation !== undefined) {
		if (cible.hostname !== TEMPORARY_HOST)
			throw new ForbiddenQuery(
				`Requête interrompue : l’accès protégé ne part que vers l’hôte temporaire (${TEMPORARY_HOST}), jamais vers le site.`
			)
		headers.set('authorization', autorisation)
	}
	if (!headers.has('user-agent')) headers.set('user-agent', CHECK_AGENT)
	return { adresse: address, entetes: headers }
}

/**
 * The guarded reader of a target: hands the transport a GET on the target, or throws
 * `RequeteInterdite` without calling it.
 */
export function keep(cible: URL, transport: Transport = realTransport, autorisation?: string): GuardedRead {
	return async (chemin, init = {}) => {
		const { adresse: address, entetes: headers } = checkQuery(chemin, init, cible, autorisation)
		return transport(address, {
			method: READ_METHOD,
			headers: headers,
			redirect: 'manual',
			...(init.signal ? { signal: init.signal } : {}),
		})
	}
}

/**
 * The two other addresses of the main host, which the proxy redirects to it (issue 990): `https://www` and the
 * plain `http`. Read only by the check of the main host, one GET each, to see the redirect and not follow it.
 */
export const REDIRECTED_ORIGINS: readonly string[] = [`https://www.${MAIN_HOST}`, `http://${MAIN_HOST}`]

/**
 * The guarded reader of the redirected origins: given the full address (not a path), hands the transport a GET,
 * or throws `RequeteInterdite` without calling it. Only for a target that is the main host, and only for the two
 * origins above. Same rules as `keep`: anonymous, no body, nothing under `/u`, no redirect followed.
 */
export function keepAliases(cible: URL, transport: Transport = realTransport): GuardedRead {
	return async (adresse, init = {}) => {
		if (cible.protocol !== 'https:' || cible.hostname !== MAIN_HOST)
			throw new ForbiddenQuery(`Requête interrompue : www et http ne se lisent que pour https://${MAIN_HOST}.`)
		const address = URL.canParse(adresse) ? new URL(adresse) : undefined
		if (!address || !REDIRECTED_ORIGINS.includes(address.origin))
			throw new ForbiddenQuery(
				`Requête interrompue : seules ${REDIRECTED_ORIGINS.join(' et ')} se lisent en plus de la cible.`
			)
		if (readPaths(address).some(chemin => chemin === ANALYTICS_PATH || chemin.startsWith(`${ANALYTICS_PATH}/`)))
			throw new ForbiddenQuery(`Requête interrompue : rien ne se lit sous ${ANALYTICS_PATH} sur www ni sur http.`)
		// The same rules as for the target (method, body, cookie, audience measurement), on this origin.
		const { adresse: checked, entetes: headers } = checkQuery(
			`${address.pathname}${address.search}`,
			init,
			new URL(address.origin)
		)
		return transport(checked, {
			method: READ_METHOD,
			headers,
			redirect: 'manual',
			...(init.signal ? { signal: init.signal } : {}),
		})
	}
}
