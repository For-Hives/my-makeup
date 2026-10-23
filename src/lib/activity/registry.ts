/**
 * The public business registry (issue 1004): « Recherche d'entreprises », the open service of the State, without
 * a key. The only thing asked of it is whether an establishment, named by its SIRET, exists and is active.
 *
 * - One request at a time, at most one a second, with a short time-out. The service is injected into the task, so
 *   no test reaches the real one (docs/tests/http-sortant.md).
 * - Only a clear answer is a verdict. « Active » needs the establishment and its legal unit both active; « ceased »
 *   needs one of them closed; an empty answer, or one without our number, is « not found ». A time-out, a 5xx, a
 *   network failure, a page that is not JSON, a shape or a state we do not know, two rows that disagree: never a
 *   verdict (`unavailable`, `unreadable`), so that the task changes no badge on them.
 * - The number is the search; it never goes into a message, a log line or an error: the answers below carry no
 *   text from the request.
 *
 * No `next` import: the task and the tests load this file.
 */

export const REGISTRY_URL = 'https://recherche-entreprises.api.gouv.fr/search'

/** At most one request a second: a polite share of a service that allows seven. */
export const MIN_INTERVAL_MS = 1000
export const TIMEOUT_MS = 5000
/** An answer larger than this is not read: a page of results is a few kilobytes. */
const BODY_MAX_BYTES = 1_000_000

export type RegistryAnswer =
	| { kind: 'active' }
	| { kind: 'ceased' }
	| { kind: 'not-found' }
	/** The answer cannot be read, or says several things: no verdict. */
	| { kind: 'unreadable' }
	/** The service did not answer in time, is down, or the network failed: no verdict. */
	| { kind: 'unavailable' }
	/** The service asks us to slow down (429): the task stops for the day. */
	| { kind: 'rate-limited' }

export interface BusinessRegistry {
	lookup(siret: string): Promise<RegistryAnswer>
}

export interface RegistryOptions {
	fetch?: typeof fetch
	timeoutMs?: number
	minIntervalMs?: number
	now?: () => number
	sleep?: (ms: number) => Promise<void>
}

const object = (value: unknown): Record<string, unknown> | null =>
	typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null

type State = 'active' | 'ceased'

/** `A` active, `F` (establishment) or `C` (legal unit) closed; anything else is unknown. */
function stateOf(value: unknown, closed: 'F' | 'C'): State | null {
	if (value === 'A') return 'active'
	if (value === closed) return 'ceased'
	return null
}

/** The verdict of a page of results for this SIRET. Pure: the tests play it without a network. */
export function decide(payload: unknown, siret: string): RegistryAnswer {
	const root = object(payload)
	const results = root?.results
	if (!Array.isArray(results)) return { kind: 'unreadable' }
	const found: State[] = []
	for (const result of results) {
		const company = object(result)
		if (company === null) return { kind: 'unreadable' }
		const rows = [
			company.siege,
			...(Array.isArray(company.matching_etablissements) ? company.matching_etablissements : []),
		]
		for (const row of rows) {
			const establishment = object(row)
			if (establishment === null || establishment.siret !== siret) continue
			const own = stateOf(establishment.etat_administratif, 'F')
			const unit = stateOf(company.etat_administratif, 'C')
			if (own === null || unit === null) return { kind: 'unreadable' }
			found.push(own === 'active' && unit === 'active' ? 'active' : 'ceased')
		}
	}
	if (found.length === 0) return { kind: 'not-found' }
	return found.every(state => state === found[0]) ? { kind: found[0] ?? 'active' } : { kind: 'unreadable' }
}

export function createBusinessRegistry(options: RegistryOptions = {}): BusinessRegistry {
	const doFetch = options.fetch ?? fetch
	const timeoutMs = options.timeoutMs ?? TIMEOUT_MS
	const interval = options.minIntervalMs ?? MIN_INTERVAL_MS
	const now = options.now ?? Date.now
	const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))
	let lastStart = Number.NEGATIVE_INFINITY

	return {
		async lookup(siret) {
			if (!/^\d{14}$/.test(siret)) return { kind: 'unreadable' }
			const wait = lastStart + interval - now()
			if (wait > 0) await sleep(wait)
			lastStart = now()
			const controller = new AbortController()
			const timer = setTimeout(() => controller.abort(), timeoutMs)
			try {
				const response = await doFetch(`${REGISTRY_URL}?q=${siret}`, {
					headers: { accept: 'application/json', 'user-agent': 'My Makeup (https://my-makeup.fr)' },
					redirect: 'error',
					signal: controller.signal,
				})
				if (response.status === 429) return { kind: 'rate-limited' }
				if (response.status !== 200) return { kind: 'unavailable' }
				const text = await response.text()
				if (text.length > BODY_MAX_BYTES) return { kind: 'unreadable' }
				let parsed: unknown
				try {
					parsed = JSON.parse(text)
				} catch {
					return { kind: 'unreadable' }
				}
				return decide(parsed, siret)
			} catch {
				// Never the error: its message may quote the address, and the address holds the number.
				return { kind: 'unavailable' }
			} finally {
				clearTimeout(timer)
			}
		},
	}
}
