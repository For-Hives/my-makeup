import { APIError, type CollectionAfterLoginHook, type CollectionBeforeOperationHook } from 'payload'
import { ipClient } from './client-ip'
import { errorMessage } from './errors'
import { type RateLimit, signInRateLimit } from './rate-limit'

/**
 * The brake on the REST door of the sign-in, `POST /api/pros/login` (ticket 076): without it, the
 * form would be braked and the API would not, and a script would try passwords there.
 *
 * Only a request that comes through REST is counted: it carries the headers the proxy wrote. The
 * Server Action calls the Local API, which has none; it brakes by itself with the same counters
 * (`signInWithPassword`), so an attempt is never counted twice.
 *
 * A place is taken before Payload looks at the account, and given back when the sign-in succeeds.
 * 429, in French and public, and the same for every email: it says nothing about the account.
 * Nothing is logged: the address is a key, never a line of a log.
 */
export const rateLimitSignIn =
	(frein: RateLimit = signInRateLimit): CollectionBeforeOperationHook =>
	({ operation, req }) => {
		if (operation !== 'login' || req.payloadAPI !== 'REST') return
		const decision = frein.prendre(ipClient(req.headers))
		if (!decision.autorise) throw new APIError(errorMessage('trop-de-tentatives'), 429, null, true)
	}

/** A sign-in that succeeded gives its place back: only the failures are counted. */
export const releaseSignInSlot =
	(frein: RateLimit = signInRateLimit): CollectionAfterLoginHook =>
	({ req, user }) => {
		if (req.payloadAPI === 'REST') frein.rendre(ipClient(req.headers))
		return user
	}
