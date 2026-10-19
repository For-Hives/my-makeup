import type { EventCode, EventType, Log } from './auth-log'
import { authLogRateLimit, signUpRateLimit } from './sign-up-rate-limits'

/**
 * The refusals of the sign-up that the proxy answers with a real 429 (ticket 084), and the way the
 * journal is kept from growing with them.
 *
 * A Server Action cannot choose its status, so the proxy looks at the sign-up before the action
 * runs: past 5 attempts an hour from one client address (the very counters the action fills), the
 * request is sent to the refusal route, which answers 429 in French. The proxy only reads the
 * counters (it takes a place and gives it back): the action is the one that counts.
 *
 * No `next` import.
 */

/** The path the proxy sends a refused sign-up to. */
export const REFUSAL_PATH = '/auth/signup/throttled'

/** The path of the sign-up page: a Server Action is posted to the page that holds its form. */
export const SIGN_UP_PATH = '/auth/signup'

/** Seconds before this client may sign up again, or `undefined` when it may. Reads, takes nothing. */
export function secondsBeforeSignUp(client: string, maintenant = Date.now()): number | undefined {
	const decision = signUpRateLimit.prendre(client, maintenant)
	if (decision.autorise) {
		signUpRateLimit.rendre(client, maintenant)
		return undefined
	}
	return decision.reessayerDansS
}

/**
 * Writes the row of a refusal, at most 3 an hour for one client address and one outcome: a flood of
 * refused requests must not fill the journal. The address is the key of a counter in memory; it is
 * never written.
 */
export async function logRefusal(journal: Log, client: string, type: EventType, code: EventCode): Promise<boolean> {
	if (!authLogRateLimit.prendre(`${client}|${type}|${code}`).autorise) return false
	await journal({ type, code, method: 'password' })
	return true
}
