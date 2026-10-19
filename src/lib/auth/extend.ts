import { doitProlonger } from './session-duration'

/** The one door that renews a session: Payload's own route, called with the cookie of the visit. */
export const ROUTE_DE_PROLONGEMENT = '/api/pros/refresh-token'

/**
 * Asks for a renewal when the session ends in less than 7 days, once per page load, whatever the
 * number of times it is asked. A failure is silent: the session is still valid until it ends, and
 * the next visit tries again. Returns whether a request went out.
 */
export function creerProlongement(appeler: (route: string) => Promise<unknown>, maintenantMs: () => number = Date.now) {
	let demande = false
	return async (expire: number | null): Promise<boolean> => {
		if (demande || expire === null || !doitProlonger(expire, Math.floor(maintenantMs() / 1000))) return false
		demande = true
		try {
			await appeler(ROUTE_DE_PROLONGEMENT)
		} catch {
			// Silent on purpose, see above.
		}
		return true
	}
}
