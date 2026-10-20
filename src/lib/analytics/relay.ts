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
export const RELAY_TIMEOUT_MS = 10_000

/** A measure is a few hundred bytes: a larger body is not one. */
const BODY_MAX_BYTES = 32 * 1024

/**
 * What Umami reads from a browser request. `x-umami-cache` is the token its script gives back
 * after a send: without it every event would open a new visit.
 */
const FORWARDED_HEADERS = ['user-agent', 'content-type', 'accept', 'accept-language', 'x-umami-cache'] as const

const READABLE_ADDRESS = /^[0-9a-f:.]{2,45}$/i

/**
 * The address of the visitor as the proxy in front of the application saw it: the last entry of
 * `X-Forwarded-For`, the one the closest proxy added. Nothing the browser wrote can replace it.
 * `X-Real-IP` is never read: a client can send it. Not `ipClient` (src/lib/auth/client-ip.ts),
 * which gives a counting key (an IPv6 address reduced to its /64 block), not an address.
 */
export function visitorAddress(entetes: Headers): string | undefined {
	const entries = (entetes.get('x-forwarded-for') ?? '')
		.split(',')
		.map(entree => entree.trim())
		.filter(Boolean)
	const last = entries.at(-1)
	return last !== undefined && READABLE_ADDRESS.test(last) && /[.:]/.test(last) ? last : undefined
}

/** The headers sent on to Umami for a request of the browser. */
export function relayHeaders(entrants: Headers): Headers {
	const outgoing = new Headers()
	for (const name of FORWARDED_HEADERS) {
		const value = entrants.get(name)
		if (value !== null) outgoing.set(name, value)
	}
	const address = visitorAddress(entrants)
	if (address !== undefined) outgoing.set('true-client-ip', address)
	return outgoing
}

export interface Relay {
	/** `umamiFromEnv()`: nothing when no instance is wired. */
	umami: UmamiEnv | undefined
	/** Injected by the tests; 10 seconds otherwise. */
	delaiMs?: number
}

const ABSENT = () => new Response(null, { status: 404 })

/** True for the hostnames of the site: the only ones that reach a real instance. */
function siteHost(requete: Request): boolean {
	const host = (requete.headers.get('host') ?? new URL(requete.url).host)
		.split(',')[0]
		?.trim()
		.replace(/:\d+$/, '')
		.toLowerCase()
	return host !== undefined && DEFAULT_UMAMI_DOMAINS.includes(host)
}

/** True when nothing may leave: the instance is a real one and the request does not come from the site. */
function kept(requete: Request, umami: UmamiEnv): boolean {
	return !umami.local && !siteHost(requete)
}

async function call(
	adresse: string,
	init: RequestInit,
	{ delaiMs = RELAY_TIMEOUT_MS }: Pick<Relay, 'delaiMs'>
): Promise<Response> {
	let response: Response
	try {
		response = await fetch(adresse, {
			...init,
			credentials: 'omit',
			redirect: 'manual',
			cache: 'no-store',
			signal: AbortSignal.timeout(delaiMs),
		})
	} catch (error) {
		const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
		return new Response(null, { status: timedOut ? 504 : 502 })
	}
	// A redirection is not followed: the instance has no reason to send one, and the relay goes where it was told only.
	if (response.status >= 300 && response.status < 400) return new Response(null, { status: 502 })
	const headers = new Headers()
	for (const name of ['content-type', 'cache-control'] as const) {
		const value = response.headers.get(name)
		if (value !== null) headers.set(name, value)
	}
	return new Response(response.status === 204 ? null : await response.arrayBuffer(), {
		status: response.status,
		headers: headers,
	})
}

/** `GET /u/script.js`: the tracker of the instance. */
export async function relayScript(requete: Request, relais: Relay): Promise<Response> {
	const { umami } = relais
	if (!umami) return ABSENT()
	if (kept(requete, umami))
		return new Response('/* Mesure d’audience : rien n’est envoyé hors du site. */\n', {
			headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' },
		})
	const response = await call(
		`${umami.origin}/script.js`,
		{ method: 'GET', headers: relayHeaders(requete.headers) },
		relais
	)
	if (response.ok && !response.headers.has('cache-control'))
		response.headers.set('Cache-Control', 'public, max-age=3600')
	return response
}

/** `POST /u/api/send`: one measure. */
export async function relaySend(requete: Request, relais: Relay): Promise<Response> {
	const { umami } = relais
	if (!umami) return ABSENT()
	if (kept(requete, umami)) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
	const announced = Number(requete.headers.get('content-length') ?? '0')
	if (announced > BODY_MAX_BYTES) return new Response(null, { status: 413 })
	const corps = await requete.arrayBuffer()
	if (corps.byteLength > BODY_MAX_BYTES) return new Response(null, { status: 413 })
	const response = await call(
		`${umami.origin}/api/send`,
		{ method: 'POST', headers: relayHeaders(requete.headers), body: corps },
		relais
	)
	response.headers.set('Cache-Control', 'no-store')
	return response
}
