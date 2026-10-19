import {
	APIError,
	type CollectionBeforeOperationHook,
	type CollectionConfig,
	type CollectionRefreshHook,
	getFieldsToSign,
	jwtSign,
} from 'payload'

import { sessionCookieFor, setCookieHeader } from './session-cookie'
import { SESSION_DURATION_S, extensionDuration, openedAt, capReached } from './session-duration'

// The pure rules live in ./duree-session (no server import, safe for the browser); re-exported here.
export * from './session-duration'

/**
 * U68, on the REST door: a renewal is refused once the session is 90 days old. 403, in French, and
 * public. The token of a session renewed by this code never outlives the ceiling (`prolongerSousPlafond`),
 * so this refuses only a token signed before that, or by hand.
 */
export const refuseAfterCap: CollectionBeforeOperationHook = ({ args, operation }) => {
	if (operation !== 'refresh') return
	const req = (args as { req?: { user?: { _sid?: unknown; sessions?: unknown } | null } }).req
	const opened = openedAt(req?.user?.sessions, req?.user?._sid)
	if (opened !== null && capReached(opened, Date.now()))
		throw new APIError('Ta session a atteint sa durée maximale : reconnecte-toi.', 403, null, true)
}

/**
 * The renewal itself: Payload's own, except that the new token lasts 14 days at most AND never goes
 * past the ceiling. It does what the default does (same fields signed, same cookie), only with the
 * shorter life when the ceiling is near.
 *
 * The cookie is written here, not by Payload's route (`setCookie: false`): Payload would end it with
 * its token, and the cookie of a sign-in outlives its token (`finDeVieDuCookie`), so that a session
 * that ended is told so (tickets 080 and 223). The token then stays out of the body as well: it is
 * not returned.
 */
export const extendUnderCap: CollectionRefreshHook = async ({ args, user }) => {
	const { req } = args
	const config: CollectionConfig = args.collection.config
	const sid = (req.user as { _sid?: string } | null)?._sid
	const opened = openedAt((user as { sessions?: unknown }).sessions, sid)
	const duration = opened === null ? SESSION_DURATION_S : extensionDuration(opened, Date.now())
	const fieldsToSign = getFieldsToSign({ collectionConfig: config, email: String(user.email), sid, user: req.user })
	const { exp, token } = await jwtSign({ fieldsToSign, secret: req.payload.secret, tokenExpiration: duration })
	const cookie = sessionCookieFor(args.collection.config.auth, req.payload.config.cookiePrefix, token, exp)
	req.responseHeaders ??= new Headers()
	req.responseHeaders.append('Set-Cookie', setCookieHeader(cookie))
	return {
		exp,
		// Payload's route would set its own cookie and then strip the token from the body: neither is wanted.
		refreshedToken: undefined as never,
		setCookie: false,
		strategy: (req.user as { _strategy?: string } | null)?._strategy,
		user,
	}
}
