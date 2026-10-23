import { createRateLimit, type RateLimit } from '../auth/rate-limit'

/**
 * Cloudflare Turnstile on the contact form (ticket 1000). No `next` import: the Server Action calls it,
 * and so do the tests.
 *
 * The form carries a widget (« managed », shown only when Cloudflare doubts the visitor). The browser
 * puts a one-time token in the field `cf-turnstile-response`; the server hands it to Cloudflare before
 * anything is stored. Three outcomes:
 * - `passed`: Cloudflare vouches for the token;
 * - `rejected`: Cloudflare refuses it (wrong, expired, already used): nothing is stored;
 * - `unavailable`: Cloudflare could not say (network, 5xx, silence past the deadline, an unreadable answer,
 *   or a configuration error that is ours). The visitor is not at fault, so the message goes through, but
 *   under a tighter brake than the usual ones (`createUnverifiedLimits`): the fail-open is limited.
 *
 * The same tight path serves a browser that says its widget could not load (`turnstile-unavailable`):
 * a script blocker, or Cloudflare down for the browser. A bot can claim it too; it then gets 2 messages an
 * hour per address and 30 an hour in all, on top of the trap field and the usual brakes.
 *
 * Nothing about the visitor is sent to Cloudflare but the token (no address). The secret never leaves the
 * server and is never logged.
 */

export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** The field the widget adds to the form: its name is Cloudflare's. */
export const TURNSTILE_TOKEN_FIELD = 'cf-turnstile-response'

/** The field the form sets when its widget could not load or failed: the one our code names. */
export const TURNSTILE_UNAVAILABLE_FIELD = 'turnstile-unavailable'

/** How long Cloudflare is given: under the 10 seconds a visitor may wait. */
export const TURNSTILE_DEADLINE_MS = 3_000

export type TurnstileOutcome = 'passed' | 'rejected' | 'unavailable'

/** Error codes that mean our own configuration is wrong, not that the visitor failed. */
const OUR_FAULT = new Set(['missing-input-secret', 'invalid-input-secret', 'internal-error'])

/** Asks Cloudflare whether this token is good. Never throws. */
export async function verifyTurnstile(
	secret: string,
	token: string,
	deadlineMs: number = TURNSTILE_DEADLINE_MS
): Promise<TurnstileOutcome> {
	try {
		const response = await fetch(TURNSTILE_VERIFY_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ secret, response: token }),
			signal: AbortSignal.timeout(deadlineMs),
		})
		if (!response.ok) return 'unavailable'
		const answer: unknown = await response.json()
		if (typeof answer !== 'object' || answer === null || !('success' in answer)) return 'unavailable'
		if (answer.success === true) return 'passed'
		const codes = 'error-codes' in answer && Array.isArray(answer['error-codes']) ? answer['error-codes'] : []
		return codes.some(code => typeof code === 'string' && OUR_FAULT.has(code)) ? 'unavailable' : 'rejected'
	} catch {
		return 'unavailable'
	}
}

export const UNVERIFIED_PER_HOUR_AND_ADDRESS = 2
export const UNVERIFIED_PER_HOUR = 30

export interface UnverifiedLimits {
	byAddress: RateLimit
	overall: RateLimit
}

/** The tight brakes of the path without verification. A name of its own gives a test counters of its own. */
export function createUnverifiedLimits(name: string): UnverifiedLimits {
	return {
		byAddress: createRateLimit({
			nom: `contact-unverified-address-${name}`,
			limite: UNVERIFIED_PER_HOUR_AND_ADDRESS,
			fenetreMs: 60 * 60 * 1000,
		}),
		overall: createRateLimit({
			nom: `contact-unverified-overall-${name}`,
			limite: UNVERIFIED_PER_HOUR,
			fenetreMs: 60 * 60 * 1000,
			clesMax: 1,
		}),
	}
}

export const UNVERIFIED_LIMITS: UnverifiedLimits = createUnverifiedLimits('shared')

/** The configuration the flow needs. `deadlineMs` and `unverified` are for a test. */
export interface TurnstileCheck {
	secret: string
	deadlineMs?: number
	unverified?: UnverifiedLimits
}

/** Seconds to wait before the tight path takes this client again, or `undefined` when it takes it (and a place is used). */
export function takeUnverifiedSlot(
	client: string,
	isLocal: boolean,
	limits: UnverifiedLimits,
	now = Date.now()
): { allowed: true } | { allowed: false; retryInSeconds: number } {
	const overall = limits.overall.prendre('all', now)
	if (!overall.autorise) return { allowed: false, retryInSeconds: overall.reessayerDansS }
	if (!isLocal) {
		const address = limits.byAddress.prendre(client, now)
		if (!address.autorise) {
			limits.overall.rendre('all', now)
			return { allowed: false, retryInSeconds: address.reessayerDansS }
		}
	}
	return { allowed: true }
}
