/**
 * The pure rules of the sliding session. This module imports nothing: it is reached by the client
 * component that renews the session, so it must never pull server code into the browser bundle.
 */

/**
 * The sliding session of a makeup artist (plan 01 §2.3, ticket 079): 14 days from the last renewal,
 * renewed by a visit to her space when less than 7 days are left, and never more than 90 days after
 * the session was opened. The rules are plain functions of two instants, so that a test plays them
 * with any clock.
 */

const DAY_S = 24 * 60 * 60

/** The length of a session, and of every renewal. */
export const SESSION_DURATION_S = 14 * DAY_S
/** A visit renews the session when it ends in less than this. */
export const EXTENSION_THRESHOLD_S = 7 * DAY_S
/** No session lives longer than this, counted from the day it was opened. */
export const SESSION_CAP_S = 90 * DAY_S

/** U67: does a visit renew a session that ends at `exp` (Unix seconds)? Strictly under 7 days left. */
export const shouldExtend = (exp: number, maintenantS: number): boolean => exp - maintenantS < EXTENSION_THRESHOLD_S

/** Seconds left before the ceiling of a session opened at `ouverteLeMs` (can be zero or negative). */
export const secondsBeforeCap = (ouverteLeMs: number, maintenantMs: number): number =>
	Math.floor((ouverteLeMs + SESSION_CAP_S * 1000 - maintenantMs) / 1000)

/** U68: a session that reached 90 days is refused a renewal. */
export const capReached = (ouverteLeMs: number, maintenantMs: number): boolean =>
	secondsBeforeCap(ouverteLeMs, maintenantMs) <= 0

/** How long a renewal at `maintenantMs` lasts: 14 days, cut short by the ceiling. */
export const extensionDuration = (ouverteLeMs: number, maintenantMs: number): number =>
	Math.min(SESSION_DURATION_S, secondsBeforeCap(ouverteLeMs, maintenantMs))

/**
 * When the session ends (`exp`, Unix seconds) according to the token in the cookie, or nothing. The
 * signature is NOT checked here: the caller has already had Payload accept the token. It only tells
 * the page whether it is worth asking for a renewal.
 */
export function tokenExpiration(jeton: string | undefined): number | null {
	const middle = jeton?.split('.')[1]
	if (!middle) return null
	try {
		const charge: unknown = JSON.parse(Buffer.from(middle, 'base64url').toString('utf8'))
		const exp = typeof charge === 'object' && charge !== null && 'exp' in charge ? charge.exp : undefined
		return typeof exp === 'number' && Number.isFinite(exp) ? exp : null
	} catch {
		return null
	}
}

/** The shape of a session on an account: Payload records the instant it was opened. */
interface StoredSession {
	id?: string
	createdAt?: string | Date
}

/** When the session `sid` of this account was opened, in milliseconds, or nothing if it is unknown. */
export function openedAt(sessions: unknown, sid: unknown): number | null {
	if (!Array.isArray(sessions) || typeof sid !== 'string') return null
	const session = (sessions as StoredSession[]).find(s => s?.id === sid)
	if (!session?.createdAt) return null
	const ms = new Date(session.createdAt).getTime()
	return Number.isFinite(ms) ? ms : null
}
