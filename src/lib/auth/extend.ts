import { shouldExtend } from './session-duration'

/** The one door that renews a session: Payload's own route, called with the cookie of the visit. */
export const EXTENSION_ROUTE = '/api/pros/refresh-token'

/**
 * Asks for a renewal when the session ends in less than 7 days, once per page load, whatever the
 * number of times it is asked. A failure is silent: the session is still valid until it ends, and
 * the next visit tries again. Returns whether a request went out.
 */
export function createExtension(appeler: (route: string) => Promise<unknown>, maintenantMs: () => number = Date.now) {
	let request = false
	return async (expire: number | null): Promise<boolean> => {
		if (request || expire === null || !shouldExtend(expire, Math.floor(maintenantMs() / 1000))) return false
		request = true
		try {
			await appeler(EXTENSION_ROUTE)
		} catch {
			// Silent on purpose, see above.
		}
		return true
	}
}
