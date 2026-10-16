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
export class RequeteInterdite extends Error {
	override name = 'RequeteInterdite'
}

/** Thrown when the target of a run is not an address the command may read. */
export class CibleRefusee extends Error {
	override name = 'CibleRefusee'
}

/** What actually sends a request: `fetch` for a run, a recorder for the tests. */
export type Transport = (adresse: URL, init: RequestInit) => Promise<Response>

/** A function shaped like `fetch`, which a run calls with a path of the target. */
export type LectureGardee = (chemin: string, init?: RequestInit) => Promise<Response>

export const METHODE_DE_LECTURE = 'GET'

/** Where the site relays its audience measurement. */
export const CHEMIN_DE_LA_MESURE = '/u'

/** The script of the measurement, served by the site. */
export const CHEMIN_DU_SCRIPT_DE_MESURE = '/u/script.js'

/** The only addresses under `/u` that are read: the ones of the frozen inventory (URLS.md, « Mesure »). */
export const CHEMINS_LUS_SOUS_LA_MESURE: readonly string[] = [
	CHEMIN_DE_LA_MESURE,
	CHEMIN_DU_SCRIPT_DE_MESURE,
	'/u/api/send',
	'/u/autre-chemin',
]

/** The site itself: the main production host. The protected access is never sent there. */
export const HOTE_PRINCIPAL = 'my-makeup.fr'

/**
 * The temporary host of the new site before the domains are swapped (PLAN-PROD-DIRECT.md): the same
 * production application, behind a protected access. The only host that takes the protected access.
 */
export const HOTE_TEMPORAIRE = 'v3.my-makeup.fr'

/** The hosts of production a run may read online. There is no other online host: no staging environment (ticket 232). */
export const HOTES_DE_PRODUCTION: readonly string[] = [HOTE_PRINCIPAL, HOTE_TEMPORAIRE]

/** The check says what it is, so that its requests can be told apart in the logs of the site. */
export const AGENT_DU_CONTROLE = 'my-makeup-controle-hote/1 (lecture seule)'

const HOTES_LOCAUX = ['localhost', '127.0.0.1', '[::1]']

const transportReel: Transport = (adresse, init) => fetch(adresse, init)

/**
 * The origin a run reads: an `https` address, or `http` on this machine. Only an origin: a path, a
 * query string, a fragment or credentials in it are refused rather than dropped.
 */
export function cibleDuControle(valeur: string): URL {
	const url = URL.canParse(valeur) ? new URL(valeur) : undefined
	if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:'))
		throw new CibleRefusee('CONTROLE_HOTE_CIBLE doit être une adresse web, comme https://my-makeup.fr.')
	if (url.protocol === 'http:' && !HOTES_LOCAUX.includes(url.hostname))
		throw new CibleRefusee(
			`CONTROLE_HOTE_CIBLE refusée (hôte « ${url.hostname} ») : en http, seul ce poste est lu. Un hôte en ligne se lit en https.`
		)
	if (url.protocol === 'https:' && !HOTES_DE_PRODUCTION.includes(url.hostname))
		throw new CibleRefusee(
			`CONTROLE_HOTE_CIBLE refusée (hôte « ${url.hostname} ») : le contrôle ne lit que la production, ${HOTES_DE_PRODUCTION.map(hote => `https://${hote}`).join(' ou ')}, ou le banc de ce poste. La v3 n’a qu’un environnement en ligne.`
		)
	if (url.username || url.password || url.pathname !== '/' || url.search || url.hash)
		throw new CibleRefusee(
			'CONTROLE_HOTE_CIBLE doit être une origine seule, comme https://my-makeup.fr : sans chemin, sans paramètre et sans identifiant.'
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

/** True when the request goes under `/u` for anything else than the inventory addresses, read as a GET. */
const versLaMesure = (url: URL): boolean => {
	const chemins = cheminsLus(url)
	const sousLaMesure = chemins.some(
		chemin => chemin === CHEMIN_DE_LA_MESURE || chemin.startsWith(`${CHEMIN_DE_LA_MESURE}/`)
	)
	return sousLaMesure && !(CHEMINS_LUS_SOUS_LA_MESURE.includes(url.pathname) && url.search === '')
}

/**
 * What the guard lets through, or `RequeteInterdite`. `chemin` is written after the origin as it
 * stands (`//x` is a path of the site, not a host).
 */
export function controlerRequete(
	chemin: string,
	init: RequestInit,
	cible: URL,
	autorisation?: string
): { adresse: URL; entetes: Headers } {
	const methode = (init.method ?? METHODE_DE_LECTURE).toUpperCase()
	if (methode !== METHODE_DE_LECTURE)
		throw new RequeteInterdite(
			`Requête ${methode} interrompue : le contrôle ne fait que lire (${METHODE_DE_LECTURE}), il n’écrit jamais sur l’hôte.`
		)
	if (init.body !== undefined && init.body !== null)
		throw new RequeteInterdite('Requête interrompue : une lecture ne porte pas de corps.')
	if (!chemin.startsWith('/'))
		throw new RequeteInterdite(
			'Requête interrompue : une adresse se lit sur la cible, par un chemin qui commence par « / ».'
		)

	const adresse = new URL(`${cible.origin}${chemin}`)
	if (adresse.origin !== cible.origin)
		throw new RequeteInterdite(
			`Requête interrompue vers « ${adresse.host} » : le contrôle ne lit que la cible (${cible.host}).`
		)
	if (versLaMesure(adresse))
		throw new RequeteInterdite(
			`Requête interrompue vers ${CHEMIN_DE_LA_MESURE}… : seules les adresses de l’inventaire sous ${CHEMIN_DE_LA_MESURE} se lisent, le contrôle n’est jamais compté comme une visite.`
		)

	const entetes = new Headers(init.headers)
	for (const nom of ['authorization', 'cookie'])
		if (entetes.has(nom))
			throw new RequeteInterdite(
				`Requête interrompue : l’en-tête « ${nom} » ferait du contrôle quelqu’un. Il lit comme une visiteuse anonyme.`
			)
	if (autorisation !== undefined) {
		if (cible.hostname !== HOTE_TEMPORAIRE)
			throw new RequeteInterdite(
				`Requête interrompue : l’accès protégé ne part que vers l’hôte temporaire (${HOTE_TEMPORAIRE}), jamais vers le site.`
			)
		entetes.set('authorization', autorisation)
	}
	if (!entetes.has('user-agent')) entetes.set('user-agent', AGENT_DU_CONTROLE)
	return { adresse, entetes }
}

/**
 * The guarded reader of a target: hands the transport a GET on the target, or throws
 * `RequeteInterdite` without calling it.
 */
export function garder(cible: URL, transport: Transport = transportReel, autorisation?: string): LectureGardee {
	return async (chemin, init = {}) => {
		const { adresse, entetes } = controlerRequete(chemin, init, cible, autorisation)
		return transport(adresse, {
			method: METHODE_DE_LECTURE,
			headers: entetes,
			redirect: 'manual',
			...(init.signal ? { signal: init.signal } : {}),
		})
	}
}
