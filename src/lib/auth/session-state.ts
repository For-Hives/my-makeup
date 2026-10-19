/**
 * What the session of a request is, told apart (ticket 080; plan 01 §2.1 AUTH-01 and AUTH-08).
 *
 * The old site mixed three different things into « no session »: a visitor who never signed in, a
 * session that ended, and a verification that could not be made (the API answered 502 or 429). The
 * third one signed people out and left them in a loop. Here each has its own state, and only the
 * first two ever send a visitor to the sign-in page.
 *
 * Nothing in this file reads a request, a cookie jar or a database: it decides from what the caller
 * observed. The token is read for its end date only, to choose the message. It is never trusted for
 * anything else: whether a session is valid is Payload's answer (signature, expiry, session in the
 * database), obtained by `signedInArtist`.
 */

/** The token as it can be told apart without a database. */
export type TokenState = 'absent' | 'illisible' | 'expire' | 'en-cours'

/** What the check of a token that has not ended gave. */
export type Verification = 'acceptee' | 'refusee' | 'panne'

/**
 * - `connectee`: the session is valid.
 * - `anonyme`: no session, or one that is no session of the space (garbage, revoked, an admin's).
 * - `expiree`: the token has reached its end date.
 * - `indisponible`: the check could not be made. Nobody is signed out, nothing is cleared.
 */
export type SessionState = 'connectee' | 'anonyme' | 'expiree' | 'indisponible'

/** The `exp` claim (Unix seconds) of a JWT, read without checking the signature; null when there is none. */
export function readExpiration(jeton: string): number | null {
	const [header, charge, signature, ...remaining] = jeton.split('.')
	if (!header || !charge || !signature || remaining.length > 0) return null
	try {
		const base64 = charge.replace(/-/g, '+').replace(/_/g, '/')
		const bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), c => c.charCodeAt(0))
		const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
		if (typeof parsed !== 'object' || parsed === null || !('exp' in parsed)) return null
		const { exp } = parsed
		return typeof exp === 'number' && Number.isFinite(exp) ? exp : null
	} catch {
		return null
	}
}

/**
 * How long the browser keeps the session cookie after its token ended: 90 days, the longest a
 * session may live (plan 01 §2.3). Without it the browser drops the cookie at the very second the
 * token ends, the server sees « never signed in », and the « session expirée » message could never
 * be shown (finding of the review of 080). The stale cookie is harmless: Payload refuses the token.
 */
export const COOKIE_SURVIVAL_AFTER_END_S = 90 * 24 * 3600

/**
 * When the browser may forget the session cookie, for a token that ends at `exp` (Unix seconds): later
 * than the token itself. The one rule for every place that sets the cookie (sign-in; the sliding
 * renewal of ticket 079 must use it too).
 */
export function cookieEndOfLife(exp: number): Date {
	return new Date((exp + COOKIE_SURVIVAL_AFTER_END_S) * 1000)
}

/** Where a token stands at `maintenantS` (Unix seconds). A token that says nothing of its end date is unreadable. */
export function tokenState(jeton: string | undefined, maintenantS: number): TokenState {
	if (jeton === undefined || jeton === '') return 'absent'
	const exp = readExpiration(jeton)
	if (exp === null) return 'illisible'
	return exp <= maintenantS ? 'expire' : 'en-cours'
}

/**
 * The state of a session. `verification` is what Payload said about a token that has not ended; it
 * is not needed (and not asked for) for the other states. A failed check never becomes `anonyme`:
 * that is the rule that keeps a passing outage from signing anyone out (U70).
 */
export function classifySession(jeton: TokenState, verification?: Verification): SessionState {
	if (jeton === 'absent' || jeton === 'illisible') return 'anonyme'
	if (jeton === 'expire') return 'expiree'
	if (verification === 'acceptee') return 'connectee'
	if (verification === 'refusee') return 'anonyme'
	return 'indisponible'
}

/** What `verifySession` needs from the outside: Payload's check and a small query on the database. */
export interface VerificationTools<Utilisateur> {
	/** Payload's own check of the request: the user, or null when it refuses (it swallows its own errors into null). */
	authentifier: () => Promise<Utilisateur | null>
	/** Whether this user is one the space accepts (not an admin's token, which has the same cookie name). */
	convient: (utilisateur: Utilisateur) => boolean
	/** A small query on the database: it throws when the database does not answer. */
	sonder: () => Promise<unknown>
}

/**
 * Tells a refusal from an outage. Payload's strategy turns every error into « no user », so a null
 * user is believed only when the database answers right after; otherwise the check could not be made
 * and nobody is signed out (AUTH-01, U70). Any throw is an outage.
 */
export async function verifySession<Utilisateur>({
	authentifier,
	convient,
	sonder,
}: VerificationTools<Utilisateur>): Promise<
	{ verification: 'acceptee'; utilisateur: Utilisateur } | { verification: Exclude<Verification, 'acceptee'> }
> {
	try {
		const user = await authentifier()
		if (user) return convient(user) ? { verification: 'acceptee', utilisateur: user } : { verification: 'refusee' }
		await sonder()
		return { verification: 'refusee' }
	} catch {
		return { verification: 'panne' }
	}
}
