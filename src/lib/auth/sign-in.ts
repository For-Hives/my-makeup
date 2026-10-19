import { AuthenticationError, UnverifiedEmail } from 'payload'
import type { EventCode, Log } from './auth-log'
import { BlockedAccount } from './blocked-account'
import { ipClient } from './client-ip'
import type { ErrorCode } from './errors'
import { type RateLimit, signInRateLimit } from './rate-limit'
import type { SessionToken } from './token'

/** A password longer than this is refused as wrong: hashing it would cost more than it proves. */
export const MAX_PASSWORD_LENGTH = 1024

/** The shortest time a refusal of the credentials takes, whoever the account is (ticket 088). */
export const REFUSAL_FLOOR_MS = 300

/** The clock of the sign-in. A test hands it a fake one, so that it measures without waiting. */
export interface Clock {
	maintenant: () => number
	attendre: (ms: number) => Promise<void>
}

const realClock: Clock = {
	maintenant: () => Date.now(),
	attendre: ms => new Promise(resolve => setTimeout(resolve, ms)),
}

export type SignInResult = { ok: true; token: string } | { ok: false; code: ErrorCode }

export interface SignInInputs {
	/** Signs the makeup artist in and gives the token back (`openWithPassword`). */
	ouvrir: (data: { email: string; password: string }) => Promise<SessionToken>
	headers: Headers
	email: unknown
	password: unknown
	frein?: RateLimit
	maintenant?: number
	/** Writes the journal row of the attempt (ticket 077). Its failure never changes the outcome. */
	journal?: Log
	/**
	 * The old-hash path (ticket 087): called when Payload refuses the credentials, with the email and
	 * the password as typed. It does the same work whatever the account, and gives back `true` when
	 * the account held the password in its old hash and now holds it in Payload's format.
	 */
	herite?: (data: { email: string; password: string }) => Promise<boolean>
	/** The clock and the pause of the floor on a refusal (ticket 088). */
	horloge?: Clock
}

const isText = (valeur: unknown): valeur is string => typeof valeur === 'string'

/**
 * The sign-in of a makeup artist by email and password.
 *
 * - Braked by client address before anything is checked (ticket 076); the place is given back when
 *   the sign-in succeeds.
 * - No composition rule on the password: an old account has one the sign-up rule would refuse
 *   (AUTH-11). The email is trimmed and lower-cased by Payload.
 * - Every refusal of the account (unknown address, wrong password) gives the same code: nothing says
 *   which one it is. One exception, on purpose (ticket 082): an address not yet confirmed, with the
 *   right password, says so, because the visitor has to go and click the link of her mail. The Local API is called with no `req`, so Payload's
 *   own brake hook (REST door) does not count this attempt a second time.
 * - An account of the old site has no password Payload knows: when Payload refuses, the password
 *   is checked against the old hash (`herite`); if it matches, the account takes the password in
 *   Payload's format, loses the old hash, and is signed in (ticket 087). The journal says `heritee`.
 * - A refusal of the credentials takes the same time whatever the cause (unknown address, wrong
 *   password, old account, account with no password): the same work, and no answer before
 *   `REFUSAL_FLOOR_MS` (ticket 088).
 * - Gives back the token for the caller to put in the cookie. It never gives back the account.
 */
export async function signInWithPassword(entrees: SignInInputs): Promise<SignInResult> {
	const clock = entrees.horloge ?? realClock
	const start = clock.maintenant()
	const { resultat: result, heritee: legacy } = await attemptSignIn(entrees, clock, start)
	const code = result.ok ? (legacy ? 'heritee' : 'ok') : result.code
	await recordAttempt(entrees.journal, code, clock.maintenant() - start)
	return result
}

/** One row for the attempt. A journal that fails changes nothing for the visitor. */
async function recordAttempt(journal: Log | undefined, code: EventCode, durationMs: number): Promise<void> {
	if (!journal) return
	try {
		await journal({ type: 'sign-in', code, durationMs, method: 'password' })
	} catch {
		// `log` never throws; a double might. The sign-in is not the journal's to fail.
	}
}

/**
 * The code of the sign-in error that Payload raised, as the visitor may be told: a refusal of the
 * account (4xx) is the generic one, a brake (429) says so, anything else is ours to report.
 */
export function failureCode(erreur: unknown): ErrorCode {
	const status = (erreur as { status?: number } | null)?.status
	// Payload raises this one only after the password has been checked and found right: saying so
	// tells nothing to someone who does not hold the password.
	if (erreur instanceof UnverifiedEmail) return 'email-non-confirme'
	if (erreur instanceof BlockedAccount) return 'compte-bloque'
	if (status === 429) return 'trop-de-tentatives'
	if (erreur instanceof AuthenticationError || (status !== undefined && status >= 400 && status < 500))
		return 'identifiants-invalides'
	return 'service-indisponible'
}

interface Tentative {
	resultat: SignInResult
	/** The sign-in went through the old hash. */
	heritee: boolean
}

async function attemptSignIn(
	{ ouvrir, headers, email, password, frein = signInRateLimit, maintenant, herite }: SignInInputs,
	horloge: Clock,
	debut: number
): Promise<Tentative> {
	const key = ipClient(headers)
	const decision = frein.prendre(key, maintenant)
	if (!decision.autorise) return { resultat: { ok: false, code: 'trop-de-tentatives' }, heritee: false }

	if (
		!isText(email) ||
		!isText(password) ||
		email.trim() === '' ||
		password === '' ||
		password.length > MAX_PASSWORD_LENGTH
	)
		return { resultat: { ok: false, code: 'identifiants-invalides' }, heritee: false }

	const legacy = false
	let code: ErrorCode
	try {
		const { token } = await ouvrir({ email, password })
		if (!token) return { resultat: { ok: false, code: 'service-indisponible' }, heritee: legacy }
		frein.rendre(key, maintenant)
		return { resultat: { ok: true, token }, heritee: legacy }
	} catch (error) {
		code = failureCode(error)
	}

	// Payload refused the credentials: the account may still hold its password in the old hash.
	if (code === 'identifiants-invalides' && herite) {
		try {
			if (await herite({ email, password })) {
				const { token } = await ouvrir({ email, password })
				if (token) {
					frein.rendre(key, maintenant)
					return { resultat: { ok: true, token }, heritee: true }
				}
				code = 'service-indisponible'
			}
		} catch (error) {
			code = failureCode(error)
			// Our own failure, not a refusal: it is not told as one.
			if (code === 'identifiants-invalides') code = 'service-indisponible'
		}
	}

	// Not the visitor's failure, or a right password: the place goes back.
	if (code === 'service-indisponible' || code === 'email-non-confirme' || code === 'compte-bloque')
		frein.rendre(key, maintenant)
	if (code === 'identifiants-invalides') await waitForFloor(horloge, debut)
	return { resultat: { ok: false, code }, heritee: legacy }
}

/** Waits until the floor is reached since `debut`: a refusal never comes back sooner. */
async function waitForFloor(horloge: Clock, debut: number): Promise<void> {
	const remaining = REFUSAL_FLOOR_MS - (horloge.maintenant() - debut)
	if (remaining > 0) await horloge.attendre(remaining)
}
