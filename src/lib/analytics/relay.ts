/**
 * The relay behind `/u` (ticket 111): `/u/script.js` and `/u/api/send` go to the Umami instance of
 * `UMAMI_ORIGIN`, and nothing else does.
 *
 * What the instance receives is chosen header by header (an allow-list): no cookie, no
 * credentials, no Referer, no address or location sent by the browser itself. The visitor's
 * address goes once, in `True-Client-IP`: Umami reads it to find the country and to tell visitors
 * apart, and does not store it. This is what it received before the relay, when the browser
 * called it directly. What comes back loses its `Set-Cookie`.
 *
 * Outside the hosts of the site, nothing leaves for the real instance: the script is an empty one
 * and a send is acknowledged and dropped. The fake Umami of the test bench, on this machine, is
 * relayed to from any host.
 */

import type { UmamiEnv } from '../env'
import { DEFAULT_UMAMI_DOMAINS } from './umami'

/** A silent instance is cut after this long. The page never waits for it, but the server holds the request meanwhile. */
export const DELAI_DU_RELAIS_MS = 10_000

/** A measure is a few hundred bytes: a larger body is not one. */
const CORPS_MAX_OCTETS = 32 * 1024

/**
 * What Umami reads from a browser request. `x-umami-cache` is the token its script gives back
 * after a send: without it every event would open a new visit.
 */
const ENTETES_TRANSMIS = ['user-agent', 'content-type', 'accept', 'accept-language', 'x-umami-cache'] as const

const ADRESSE_LISIBLE = /^[0-9a-f:.]{2,45}$/i

/**
 * The address of the visitor as the proxy in front of the application saw it: the last entry of
 * `X-Forwarded-For`, the one the closest proxy added. Nothing the browser wrote can replace it.
 * `X-Real-IP` is never read: a client can send it. Not `ipClient` (src/lib/auth/client-ip.ts),
 * which gives a counting key (an IPv6 address reduced to its /64 block), not an address.
 */
export function adresseDuVisiteur(entetes: Headers): string | undefined {
	const entrees = (entetes.get('x-forwarded-for') ?? '')
		.split(',')
		.map(entree => entree.trim())
		.filter(Boolean)
	const derniere = entrees.at(-1)
	return derniere !== undefined && ADRESSE_LISIBLE.test(derniere) && /[.:]/.test(derniere) ? derniere : undefined
}

/** The headers sent on to Umami for a request of the browser. */
export function enTetesDuRelais(entrants: Headers): Headers {
	const sortants = new Headers()
	for (const nom of ENTETES_TRANSMIS) {
		const valeur = entrants.get(nom)
		if (valeur !== null) sortants.set(nom, valeur)
	}
	const adresse = adresseDuVisiteur(entrants)
	if (adresse !== undefined) sortants.set('true-client-ip', adresse)
	return sortants
}

export interface Relais {
	/** `umamiFromEnv()`: nothing when no instance is wired. */
	umami: UmamiEnv | undefined
	/** Injected by the tests; 10 seconds otherwise. */
	delaiMs?: number
}

const ABSENT = () => new Response(null, { status: 404 })

/** True for the hostnames of the site: the only ones that reach a real instance. */
function hoteDuSite(requete: Request): boolean {
	const hote = (requete.headers.get('host') ?? new URL(requete.url).host)
		.split(',')[0]
		?.trim()
		.replace(/:\d+$/, '')
		.toLowerCase()
	return hote !== undefined && DEFAULT_UMAMI_DOMAINS.includes(hote)
}

/** True when nothing may leave: the instance is a real one and the request does not come from the site. */
function retenu(requete: Request, umami: UmamiEnv): boolean {
	return !umami.local && !hoteDuSite(requete)
}

async function appeler(
	adresse: string,
	init: RequestInit,
	{ delaiMs = DELAI_DU_RELAIS_MS }: Pick<Relais, 'delaiMs'>
): Promise<Response> {
	let reponse: Response
	try {
		reponse = await fetch(adresse, {
			...init,
			credentials: 'omit',
			redirect: 'manual',
			cache: 'no-store',
			signal: AbortSignal.timeout(delaiMs),
		})
	} catch (erreur) {
		const delaiDepasse = erreur instanceof Error && (erreur.name === 'TimeoutError' || erreur.name === 'AbortError')
		return new Response(null, { status: delaiDepasse ? 504 : 502 })
	}
	// A redirection is not followed: the instance has no reason to send one, and the relay goes where it was told only.
	if (reponse.status >= 300 && reponse.status < 400) return new Response(null, { status: 502 })
	const entetes = new Headers()
	for (const nom of ['content-type', 'cache-control'] as const) {
		const valeur = reponse.headers.get(nom)
		if (valeur !== null) entetes.set(nom, valeur)
	}
	return new Response(reponse.status === 204 ? null : await reponse.arrayBuffer(), {
		status: reponse.status,
		headers: entetes,
	})
}

/** `GET /u/script.js`: the tracker of the instance. */
export async function relayerLeScript(requete: Request, relais: Relais): Promise<Response> {
	const { umami } = relais
	if (!umami) return ABSENT()
	if (retenu(requete, umami))
		return new Response('/* Mesure d’audience : rien n’est envoyé hors du site. */\n', {
			headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' },
		})
	const reponse = await appeler(
		`${umami.origin}/script.js`,
		{ method: 'GET', headers: enTetesDuRelais(requete.headers) },
		relais
	)
	if (reponse.ok && !reponse.headers.has('cache-control')) reponse.headers.set('Cache-Control', 'public, max-age=3600')
	return reponse
}

/** `POST /u/api/send`: one measure. */
export async function relayerLEnvoi(requete: Request, relais: Relais): Promise<Response> {
	const { umami } = relais
	if (!umami) return ABSENT()
	if (retenu(requete, umami)) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
	const annonce = Number(requete.headers.get('content-length') ?? '0')
	if (annonce > CORPS_MAX_OCTETS) return new Response(null, { status: 413 })
	const corps = await requete.arrayBuffer()
	if (corps.byteLength > CORPS_MAX_OCTETS) return new Response(null, { status: 413 })
	const reponse = await appeler(
		`${umami.origin}/api/send`,
		{ method: 'POST', headers: enTetesDuRelais(requete.headers), body: corps },
		relais
	)
	reponse.headers.set('Cache-Control', 'no-store')
	return reponse
}
