import {
	commitTransaction,
	createLocalReq,
	initTransaction,
	killTransaction,
	type Payload,
	resetPasswordOperation,
} from 'payload'
import { composerEmail } from '../emails/layout'
import { passwordResetEmailContent } from '../emails/password-reset'
import type { SendEmail } from '../emails/send'
import type { EventCode, Log } from './auth-log'
import { ipClient } from './client-ip'
import {
	FORGOT_PASSWORD_FLOOR_MS,
	type ForgotPasswordFailureCode,
	type PasswordResetFailureCode,
	passwordResetToken,
	validateAddress,
	validateNewPassword,
} from './forgot-password'
import { PASSWORD_RESET_CONTEXT } from './forgot-payload'
import { forgotPasswordRateLimit, passwordResetRateLimit, type RateLimit } from './rate-limit'
import { type OpenSession, openSessionForLink } from './session-after-link'

/**
 * The forgotten password, server side (tickets 085 and 086). Two steps, and no `next` import: the
 * Server Actions call them, and so do the tests.
 *
 * The request (`requestPasswordLink`)
 * - Takes a place in the brake of the client address first, and never gives it back: a place given
 *   back only for a known address would tell which ones are known.
 * - Answers the same, in the same time, for an address with an account and one without. Payload's
 *   own forgotten-password operation makes the token (24 hours), and the mail leaves by the one
 *   door of the site (ticket 073, text and HTML), but AFTER the answer: `apres` schedules it (the
 *   Server Action gives `after`), and the answer waits for a floor of 300 ms. What the relay takes
 *   to send a mail therefore never reaches the visitor. The operation is called with its own mail
 *   off, which also switches off its interval of 15 seconds per account: `reserverLaDemande`
 *   keeps it, with the same atomic write as Payload's.
 * - Writes one journal row, `ok` whatever the address: the journal holds nothing that tells them apart.
 *
 * The choice of the new password (`resetPassword`)
 * - One transaction: Payload's reset (new hash, all the sessions of the account emptied, the link
 *   spent, the address marked confirmed: the link proves the mailbox, ticket 311), then the session that reset opens is dropped (she signs in with her new password, as on
 *   the old site), the hash of the old site is dropped (the old password must not work through the
 *   legacy path) and the token is erased.
 * - A code that is not ours, or whose link is spent or past its hour, is `code-invalide`.
 */

export type ForgotPasswordResult = { ok: true } | { ok: false; code: ForgotPasswordFailureCode }

export interface ForgotPasswordInputs {
	payload: Payload
	headers: Headers
	email: unknown
	/** Runs the work after the answer: `after` of Next in a Server Action. A test hands one that waits. */
	apres: (travail: () => Promise<void>) => void
	/** The door of the mails of the site. */
	envoyer: SendEmail
	/** The address of the site, for the link of the mail. */
	site: string
	/** Minimum time between two mails to the same account. */
	intervalleMs?: number
	frein?: RateLimit
	journal?: Log
	plancherMs?: number
}

/** As Payload's own `minRequestInterval`: one mail per account every 15 seconds. */
export const INTERVAL_PER_ACCOUNT_MS = 15_000

/**
 * Takes the place of the mail for this account, in one atomic write: the account is found only if no
 * request is recorded in the last `intervalleMs`. Gives the stored address and a way to give the place
 * back (when the mail did not leave), or nothing: unknown account, or a mail left a moment ago.
 */
async function reserveRequest(payload: Payload, email: string, intervalleMs: number) {
	const now = Date.now()
	const requestedAt = new Date(now).toISOString()
	const account = (await payload.db.updateOne({
		collection: 'pros',
		data: { resetPasswordRequestedAt: requestedAt },
		options: { atomic: true },
		where: {
			and: [
				{ email: { equals: email.toLowerCase() } },
				{
					or: [
						{ resetPasswordRequestedAt: { exists: false } },
						{ resetPasswordRequestedAt: { equals: null } },
						{ resetPasswordRequestedAt: { less_than_equal: new Date(now - intervalleMs).toISOString() } },
					],
				},
			],
		},
	})) as { id: number | string; email?: string } | null
	if (!account?.email) return null
	const id = account.id
	return {
		email: account.email,
		rendre: () =>
			payload.db.updateOne({
				collection: 'pros',
				data: { resetPasswordRequestedAt: null },
				options: { atomic: true },
				where: { and: [{ id: { equals: id } }, { resetPasswordRequestedAt: { equals: requestedAt } }] },
			}),
	}
}

const wait = (ms: number) => new Promise<void>(fin => setTimeout(fin, Math.max(0, ms)))

export async function requestPasswordLink({
	payload,
	headers,
	email,
	apres,
	envoyer,
	site,
	intervalleMs = INTERVAL_PER_ACCOUNT_MS,
	frein = forgotPasswordRateLimit,
	journal,
	plancherMs = FORGOT_PASSWORD_FLOOR_MS,
}: ForgotPasswordInputs): Promise<ForgotPasswordResult> {
	const start = Date.now()
	const record = async (code: EventCode, durationMs: number) => {
		try {
			await journal?.({ type: 'forgot-password', code, durationMs })
		} catch {
			// The journal is not the request's to fail.
		}
	}

	if (!frein.prendre(ipClient(headers)).autorise) {
		await record('trop-de-tentatives', Date.now() - start)
		return { ok: false, code: 'trop-de-tentatives' }
	}
	const address = validateAddress(email)
	if (!address.ok) {
		await record('donnees-invalides', Date.now() - start)
		return { ok: false, code: address.code }
	}

	const work = async () => {
		let code: EventCode = 'ok'
		let reservation: Awaited<ReturnType<typeof reserveRequest>> = null
		try {
			reservation = await reserveRequest(payload, address.email, intervalleMs)
			if (reservation) {
				const token = await payload.forgotPassword({
					collection: 'pros',
					data: { email: reservation.email },
					disableEmail: true,
				})
				if (token) await envoyer({ a: reservation.email, ...composerEmail(passwordResetEmailContent(token), site) })
			}
		} catch {
			// The mail did not leave: the place is given back, so that she can ask again at once.
			await reservation?.rendre().catch(() => undefined)
			// No detail: the error of the relay names the address. A request that fails to send is the
			// visitor's to repeat; what she was told does not change.
			code = 'service-indisponible'
			try {
				payload.logger.error({ msg: 'Un lien de mot de passe oublié n’a pas pu partir.' })
			} catch {
				// The log itself failed.
			}
		}
		await record(code, Date.now() - start)
	}
	try {
		apres(work)
	} catch {
		// Outside a request, `after` refuses: the work then runs here, in the background of this call.
		void work()
	}

	await wait(start + plancherMs - Date.now())
	return { ok: true }
}

/** `token` is there only when the caller asked for a session (`ouvrirSession`) and one was opened (ticket 302). */
export type PasswordResetResult = { ok: true; token?: string } | { ok: false; code: PasswordResetFailureCode }

export interface PasswordResetInputs {
	payload: Payload
	headers: Headers
	/** The token of the cookie of the page, as it came. */
	jeton: unknown
	motDePasse: unknown
	confirmation: unknown
	frein?: RateLimit
	journal?: Log
	/**
	 * Opens a session for the account once the new password is saved (ticket 302). Without it no session is
	 * opened. The reset has emptied every session of the account first, so that this one is the only one.
	 */
	ouvrirSession?: OpenSession
}

export async function resetPassword({
	payload,
	headers,
	jeton: token,
	motDePasse,
	confirmation,
	frein = passwordResetRateLimit,
	journal,
	ouvrirSession,
}: PasswordResetInputs): Promise<PasswordResetResult> {
	const start = Date.now()
	const record = async (code: EventCode) => {
		try {
			await journal?.({ type: 'password-reset', code, durationMs: Date.now() - start })
		} catch {
			// The journal is not the reset's to fail.
		}
	}
	const key = ipClient(headers)
	if (!frein.prendre(key).autorise) {
		await record('trop-de-tentatives')
		return { ok: false, code: 'trop-de-tentatives' }
	}

	if (typeof token !== 'string' || token === '') {
		await record('lien-invalide')
		return { ok: false, code: 'code-absent' }
	}
	const code = passwordResetToken(token)
	if (!code) {
		await record('lien-invalide')
		return { ok: false, code: 'code-invalide' }
	}
	const isNew = validateNewPassword(motDePasse, confirmation)
	if (!isNew.ok) {
		await record('donnees-invalides')
		return { ok: false, code: isNew.code }
	}

	const req = await createLocalReq({ context: { [PASSWORD_RESET_CONTEXT]: true } }, payload)
	await initTransaction(req)
	let accountId: number | string
	try {
		// Claims the link first, in this transaction: the write locks the row, so that a second submit of
		// the same link waits for this one to commit, then finds the token gone and is refused.
		const claimed = await payload.db.updateOne({
			collection: 'pros',
			data: { resetPasswordRequestedAt: null },
			options: { atomic: true },
			req,
			where: {
				and: [
					{ resetPasswordToken: { equals: code } },
					{ resetPasswordExpiration: { greater_than: new Date().toISOString() } },
				],
			},
		})
		if (!claimed) throw Object.assign(new Error('Lien refusé.'), { status: 403 })
		const { user } = await resetPasswordOperation({
			collection: payload.collections.pros,
			data: { token: code, password: isNew.motDePasse },
			depth: 0,
			overrideAccess: true,
			req,
		})
		// Through the adapter: these fields are written by no request. Emptying the sessions drops the
		// one the reset has just opened; she signs in with her new password. A write that holds an array
		// is a full upsert in the adapter, which needs the whole row (as Payload's own session writes do).
		const row = await payload.db.findOne<Record<string, unknown> & { id: number }>({
			collection: 'pros',
			req,
			where: { id: { equals: user.id } },
		})
		if (!row) throw new Error('Le compte a disparu pendant la réinitialisation.')
		await payload.db.updateOne({
			collection: 'pros',
			// The link went to the mailbox of the account: choosing a password through it proves the address as
			// the confirmation link does (ticket 311). Without this, an account whose address was never confirmed
			// (a lost mail, an account of the old site) could neither sign in nor get a session.
			data: { ...row, sessions: [], legacyBcrypt: null, resetPasswordToken: null, _verified: true },
			id: user.id as number,
			req,
			returning: false,
		})
		await commitTransaction(req)
		accountId = user.id as number | string
	} catch (error) {
		await killTransaction(req)
		const status = (error as { status?: number } | null)?.status
		const refusal = status === 403 || status === 400
		await record(refusal ? 'lien-invalide' : 'service-indisponible')
		return { ok: false, code: refusal ? 'code-invalide' : 'service-indisponible' }
	}
	frein.rendre(key)
	await record('ok')
	if (!ouvrirSession) return { ok: true }
	// After the commit: opening a session takes its own transaction and a lock on the account, which the
	// reset's write held until now. A refusal (blocked, address not confirmed) or a failure leaves the
	// password changed and gives the result of before: she signs in with it.
	const session = await openSessionForLink({
		payload,
		accountId,
		origin: 'password-reset',
		journal,
		open: ouvrirSession,
	})
	return session.ok ? { ok: true, token: session.token } : { ok: true }
}

/**
 * Whether the link of a cookie can still be used: ours in shape, known, and within its hour. The page
 * of the link asks it to say « plus valable » at once, instead of after the form. A failure of the
 * database says « yes »: the form then answers for itself.
 */
export async function linkStillValid(payload: Payload, jeton: unknown): Promise<boolean> {
	const code = passwordResetToken(jeton)
	if (!code) return false
	try {
		const row = await payload.db.findOne({
			collection: 'pros',
			where: {
				and: [
					{ resetPasswordToken: { equals: code } },
					{ resetPasswordExpiration: { greater_than: new Date().toISOString() } },
				],
			},
		})
		return Boolean(row)
	} catch {
		return true
	}
}
