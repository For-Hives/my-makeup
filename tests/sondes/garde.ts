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
 * (tests/sondes/sondes.ts).
 *
 * The guard of the end-to-end tests (tests/outils/garde-environnement.ts) is another guard,
 * which this file neither imports nor relaxes: it refuses production, always (U86).
 */

/** Thrown before a request leaves: it is not a read, or it goes where a probe never goes. */
export class RequeteInterdite extends Error {
	override name = 'RequeteInterdite'
}

/** Thrown when the target of a run is not an address the probes may read. */
export class CibleRefusee extends Error {
	override name = 'CibleRefusee'
}

/** What actually sends a request: `fetch` for a run, a recorder for the self-check of R01. */
export type Transport = (adresse: URL, init: RequestInit) => Promise<Response>

/** A function shaped like `fetch`: whatever a probe asks for, the guard decides. */
export type LectureGardee = (entree: string | URL | Request, init?: RequestInit) => Promise<Response>

/** The only method that passes. */
export const METHODE_DE_LECTURE = 'GET'

/** Where the site relays its audience measurement: `/u/script.js`, `/u/api/send`, and the rest of `/u`. */
export const CHEMIN_DE_LA_MESURE = '/u'

/** Headers that would make the probe someone: a probe reads as an anonymous visitor. */
const ENTETES_D_IDENTITE = ['authorization', 'cookie'] as const

/** Hosts a run may read in plain HTTP: this machine (the bench, ticket 156). */
const HOTES_LOCAUX = ['localhost', '127.0.0.1', '[::1]']

/** The probe says what it is, so that its requests can be told apart in the logs of the site. */
export const AGENT_DES_SONDES = 'my-makeup-sondes/1 (lecture seule)'

const transportReel: Transport = (adresse, init) => fetch(adresse, init)

/**
 * The origin a run reads: an `https` address, or `http` on this machine. Only an origin: a
 * path, a query string, a fragment or credentials in it are refused rather than dropped.
 */
export function cibleDesSondes(valeur: string): URL {
	const url = URL.canParse(valeur) ? new URL(valeur) : undefined
	if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:'))
		throw new CibleRefusee('SONDES_CIBLE doit être une adresse web, comme https://my-makeup.fr.')
	if (url.protocol === 'http:' && !HOTES_LOCAUX.includes(url.hostname))
		throw new CibleRefusee(
			`SONDES_CIBLE refusée (hôte « ${url.hostname} ») : en http, seul ce poste est lu. Un site en ligne se lit en https.`
		)
	if (url.username || url.password || url.pathname !== '/' || url.search || url.hash)
		throw new CibleRefusee(
			'SONDES_CIBLE doit être une origine seule, comme https://my-makeup.fr : sans chemin, sans paramètre et sans identifiant.'
		)
	return new URL(url.origin)
}

/** The path as the server may read it: decoded when it can be, without repeated slashes. */
function cheminsLus(url: URL): string[] {
	let decode = url.pathname
	try {
		decode = decodeURIComponent(url.pathname)
	} catch {
		// A malformed escape is checked as written.
	}
	return [url.pathname, decode].map(chemin => chemin.replace(/\/{2,}/g, '/'))
}

const versLaMesure = (url: URL): boolean =>
	cheminsLus(url).some(chemin => chemin === CHEMIN_DE_LA_MESURE || chemin.startsWith(`${CHEMIN_DE_LA_MESURE}/`))

/**
 * What the guard lets through, or `RequeteInterdite`. Exported for the tests: a probe calls
 * the function `garder()` returns, never the transport.
 */
export function controlerRequete(
	entree: string | URL | Request,
	init: RequestInit,
	cible: URL
): { adresse: URL; entetes: Headers } {
	const demande = entree instanceof Request ? entree : undefined
	const methode = (init.method ?? demande?.method ?? METHODE_DE_LECTURE).toUpperCase()
	if (methode !== METHODE_DE_LECTURE)
		throw new RequeteInterdite(
			`Requête ${methode} interrompue : une sonde ne fait que lire (${METHODE_DE_LECTURE}), elle n’écrit jamais sur le site.`
		)
	if (init.body !== undefined && init.body !== null)
		throw new RequeteInterdite('Requête interrompue : une lecture ne porte pas de corps.')

	const adresse = demande ? new URL(demande.url) : new URL(entree instanceof URL ? entree.href : String(entree), cible)
	if (adresse.origin !== cible.origin)
		throw new RequeteInterdite(
			`Requête interrompue vers « ${adresse.host} » : une sonde ne lit que la cible (${cible.host}).`
		)
	if (versLaMesure(adresse))
		throw new RequeteInterdite(
			`Requête interrompue vers ${CHEMIN_DE_LA_MESURE}… : la mesure d’audience est bloquée, une sonde n’est jamais comptée comme une visite.`
		)

	const entetes = new Headers(init.headers ?? demande?.headers)
	for (const nom of ENTETES_D_IDENTITE)
		if (entetes.has(nom))
			throw new RequeteInterdite(
				`Requête interrompue : l’en-tête « ${nom} » ferait de la sonde quelqu’un. Une sonde lit comme une visiteuse anonyme.`
			)
	if (!entetes.has('user-agent')) entetes.set('user-agent', AGENT_DES_SONDES)
	return { adresse, entetes }
}

/**
 * The guarded reader of a target: a function shaped like `fetch` that hands the transport a GET
 * on the target, or throws `RequeteInterdite` without calling it.
 */
export function garder(cible: URL, transport: Transport = transportReel): LectureGardee {
	return async (entree, init = {}) => {
		const { adresse, entetes } = controlerRequete(entree, init, cible)
		return transport(adresse, {
			method: METHODE_DE_LECTURE,
			headers: entetes,
			redirect: 'manual',
			...(init.signal ? { signal: init.signal } : {}),
		})
	}
}
