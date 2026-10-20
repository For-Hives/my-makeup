import { createLocalReq, logoutOperation, type Payload } from 'payload'
import { COLLECTION_PROS } from '../access'
import type { Log } from './auth-log'

/**
 * The sign-out of a makeup artist (ticket 078): the session is removed from the database, so the
 * token in the cookie, and any copy of it, is refused from then on. Closing the cookie is not enough
 * and is not the point: the cookie is the browser's, the session is ours.
 *
 * - `toutes: false` removes the session of this request only; `toutes: true` removes every session
 *   of the account, on every device. The sessions of other accounts are never touched.
 * - The session is found from the headers of the request (the cookie, with the `Origin` Payload
 *   asks for), the way the pages of the space find it. An admin's session, which has the same
 *   cookie name, is no session of the space: it is left as it is.
 * - Without a session there is nothing to remove: the answer is `fermee: false`, and the caller
 *   still clears the cookie. A visitor who signs out twice, or from a second tab, gets no error.
 *
 * No `next` import: the tests load this file too. The Server Action that calls it clears the cookie.
 */

export type SignOutResult = { ok: true; fermee: boolean } | { ok: false }

export interface SignOutInputs {
	payload: Payload
	headers: Headers
	/** Every session of the account instead of this one. */
	toutes: boolean
	journal?: Log
}

export async function closeSession({ payload, headers, toutes, journal }: SignOutInputs): Promise<SignOutResult> {
	const start = Date.now()
	const type = toutes ? 'sign-out-everywhere' : 'sign-out'
	const record = async (code: 'ok' | 'service-indisponible') => {
		try {
			await journal?.({ type, code, durationMs: Date.now() - start })
		} catch {
			// The journal is not the sign-out's to fail.
		}
	}
	try {
		const { user } = await payload.auth({ headers })
		if (!user || user.collection !== COLLECTION_PROS) return { ok: true, fermee: false }
		const closed = await logoutOperation({
			allSessions: toutes,
			collection: payload.collections[COLLECTION_PROS],
			req: await createLocalReq({ user }, payload),
		})
		if (!closed) {
			await record('service-indisponible')
			return { ok: false }
		}
		await record('ok')
		return { ok: true, fermee: true }
	} catch {
		await record('service-indisponible')
		return { ok: false }
	}
}
