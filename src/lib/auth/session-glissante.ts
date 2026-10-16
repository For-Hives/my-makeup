import {
	APIError,
	type CollectionBeforeOperationHook,
	type CollectionConfig,
	type CollectionRefreshHook,
	getFieldsToSign,
	jwtSign,
} from 'payload'

import { cookieDeSessionDe, enteteSetCookie } from './cookie-de-session'
import { DUREE_SESSION_S, dureeDuProlongement, ouverteLe, plafondAtteint } from './duree-session'

// The pure rules live in ./duree-session (no server import, safe for the browser); re-exported here.
export * from './duree-session'

/**
 * U68, on the REST door: a renewal is refused once the session is 90 days old. 403, in French, and
 * public. The token of a session renewed by this code never outlives the ceiling (`prolongerSousPlafond`),
 * so this refuses only a token signed before that, or by hand.
 */
export const refuserApresLePlafond: CollectionBeforeOperationHook = ({ args, operation }) => {
	if (operation !== 'refresh') return
	const req = (args as { req?: { user?: { _sid?: unknown; sessions?: unknown } | null } }).req
	const ouverte = ouverteLe(req?.user?.sessions, req?.user?._sid)
	if (ouverte !== null && plafondAtteint(ouverte, Date.now()))
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
export const prolongerSousPlafond: CollectionRefreshHook = async ({ args, user }) => {
	const { req } = args
	const config: CollectionConfig = args.collection.config
	const sid = (req.user as { _sid?: string } | null)?._sid
	const ouverte = ouverteLe((user as { sessions?: unknown }).sessions, sid)
	const duree = ouverte === null ? DUREE_SESSION_S : dureeDuProlongement(ouverte, Date.now())
	const fieldsToSign = getFieldsToSign({ collectionConfig: config, email: String(user.email), sid, user: req.user })
	const { exp, token } = await jwtSign({ fieldsToSign, secret: req.payload.secret, tokenExpiration: duree })
	const cookie = cookieDeSessionDe(args.collection.config.auth, req.payload.config.cookiePrefix, token, exp)
	req.responseHeaders ??= new Headers()
	req.responseHeaders.append('Set-Cookie', enteteSetCookie(cookie))
	return {
		exp,
		// Payload's route would set its own cookie and then strip the token from the body: neither is wanted.
		refreshedToken: undefined as never,
		setCookie: false,
		strategy: (req.user as { _strategy?: string } | null)?._strategy,
		user,
	}
}
