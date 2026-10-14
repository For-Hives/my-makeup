import {
	APIError,
	type CollectionBeforeOperationHook,
	type CollectionConfig,
	type CollectionRefreshHook,
	getFieldsToSign,
	jwtSign,
} from 'payload'

/**
 * The sliding session of a makeup artist (plan 01 §2.3, ticket 079): 14 days from the last renewal,
 * renewed by a visit to her space when less than 7 days are left, and never more than 90 days after
 * the session was opened. The rules are plain functions of two instants, so that a test plays them
 * with any clock.
 */

const JOUR_S = 24 * 60 * 60

/** The length of a session, and of every renewal. */
export const DUREE_SESSION_S = 14 * JOUR_S
/** A visit renews the session when it ends in less than this. */
export const SEUIL_DE_PROLONGEMENT_S = 7 * JOUR_S
/** No session lives longer than this, counted from the day it was opened. */
export const PLAFOND_DE_SESSION_S = 90 * JOUR_S

/** U67: does a visit renew a session that ends at `exp` (Unix seconds)? Strictly under 7 days left. */
export const doitProlonger = (exp: number, maintenantS: number): boolean => exp - maintenantS < SEUIL_DE_PROLONGEMENT_S

/** Seconds left before the ceiling of a session opened at `ouverteLeMs` (can be zero or negative). */
export const secondesAvantLePlafond = (ouverteLeMs: number, maintenantMs: number): number =>
	Math.floor((ouverteLeMs + PLAFOND_DE_SESSION_S * 1000 - maintenantMs) / 1000)

/** U68: a session that reached 90 days is refused a renewal. */
export const plafondAtteint = (ouverteLeMs: number, maintenantMs: number): boolean =>
	secondesAvantLePlafond(ouverteLeMs, maintenantMs) <= 0

/** How long a renewal at `maintenantMs` lasts: 14 days, cut short by the ceiling. */
export const dureeDuProlongement = (ouverteLeMs: number, maintenantMs: number): number =>
	Math.min(DUREE_SESSION_S, secondesAvantLePlafond(ouverteLeMs, maintenantMs))

/**
 * When the session ends (`exp`, Unix seconds) according to the token in the cookie, or nothing. The
 * signature is NOT checked here: the caller has already had Payload accept the token. It only tells
 * the page whether it is worth asking for a renewal.
 */
export function expirationDuJeton(jeton: string | undefined): number | null {
	const milieu = jeton?.split('.')[1]
	if (!milieu) return null
	try {
		const charge: unknown = JSON.parse(Buffer.from(milieu, 'base64url').toString('utf8'))
		const exp = typeof charge === 'object' && charge !== null && 'exp' in charge ? charge.exp : undefined
		return typeof exp === 'number' && Number.isFinite(exp) ? exp : null
	} catch {
		return null
	}
}

/** The shape of a session on an account: Payload records the instant it was opened. */
interface SessionEnregistree {
	id?: string
	createdAt?: string | Date
}

/** When the session `sid` of this account was opened, in milliseconds, or nothing if it is unknown. */
export function ouverteLe(sessions: unknown, sid: unknown): number | null {
	if (!Array.isArray(sessions) || typeof sid !== 'string') return null
	const session = (sessions as SessionEnregistree[]).find(s => s?.id === sid)
	if (!session?.createdAt) return null
	const ms = new Date(session.createdAt).getTime()
	return Number.isFinite(ms) ? ms : null
}

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
 */
export const prolongerSousPlafond: CollectionRefreshHook = async ({ args, user }) => {
	const { req } = args
	const config: CollectionConfig = args.collection.config
	const sid = (req.user as { _sid?: string } | null)?._sid
	const ouverte = ouverteLe((user as { sessions?: unknown }).sessions, sid)
	const duree = ouverte === null ? DUREE_SESSION_S : dureeDuProlongement(ouverte, Date.now())
	const fieldsToSign = getFieldsToSign({ collectionConfig: config, email: String(user.email), sid, user: req.user })
	const { exp, token } = await jwtSign({ fieldsToSign, secret: req.payload.secret, tokenExpiration: duree })
	return {
		exp,
		refreshedToken: token,
		setCookie: true,
		strategy: (req.user as { _strategy?: string } | null)?._strategy,
		user,
	}
}
