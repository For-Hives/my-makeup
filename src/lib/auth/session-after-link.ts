import type { Payload } from 'payload'
import type { Log } from './auth-log'
import { pendingTrace, usageTrace } from './confirmation'
import { CONFIRMATION_TOKEN, SESSION_OFFER_WINDOW_MS } from './confirmation-link'
import { openWithoutPassword, SessionRefused } from './token'

/**
 * The session a link of a mail opens (ticket 302): after the address is confirmed, and after a new
 * password is chosen. No `next` import: the Server Actions put the token in the cookie.
 *
 * What stands between a link and a session:
 * - the proof is the single use of the link. For the confirmation it is one atomic write that turns
 *   `pending:` (confirmed, session unclaimed) into `utilise:`, with the creation date of the account in
 *   the condition (the window of `SESSION_OFFER_WINDOW_MS`); two clicks at the same instant, or the same
 *   link again, get one session at most. For the new password the proof is the reset itself, which spends
 *   its link in the same transaction.
 * - the same rules as a sign-in by password, asked of the account INSIDE the locked transaction that
 *   writes the session (`openWithoutPassword`): a blocked account (`compte-bloque`) and an address that
 *   is not confirmed (`email-non-confirme`) get no session. The visitor is told nothing of the reason.
 * - a failure of any kind opens nothing and changes nothing else: the address stays confirmed, the
 *   password stays changed, the caller falls back to the screen that was there before.
 * - one row in the journal, `sign-in`, with the origin as its method (`confirmation`, `password-reset`),
 *   and the code of the outcome. The journal holds no token and no address.
 */

export type LinkOrigin = 'confirmation' | 'password-reset'

/** The way sessions are opened: `openWithoutPassword`; a test hands another. */
export type OpenSession = typeof openWithoutPassword

export type LinkSessionOutcome = { ok: true; token: string } | { ok: false }

/** The rule of a sign-in by password, as far as an account that has no password to check can meet it. */
const refuseUnfit = (account: Record<string, unknown>): SessionRefused['code'] | null => {
	if (account.blocked === true) return 'compte-bloque'
	if (account._verified !== true) return 'email-non-confirme'
	return null
}

/** Opens one session for `accountId` and writes the row of the journal. Never throws. */
export async function openSessionForLink({
	payload,
	accountId,
	origin,
	journal,
	open = openWithoutPassword,
}: {
	payload: Payload
	accountId: number | string
	origin: LinkOrigin
	journal?: Log
	open?: OpenSession
}): Promise<LinkSessionOutcome> {
	const start = Date.now()
	const record = async (code: 'ok' | 'compte-bloque' | 'email-non-confirme' | 'service-indisponible') => {
		try {
			await journal?.({ type: 'sign-in', code, durationMs: Date.now() - start, method: origin })
		} catch {
			// The journal is not the sign-in's to fail.
		}
	}
	try {
		const { token } = await open(payload, { collection: 'pros', id: accountId }, undefined, refuseUnfit)
		if (!token) {
			await record('service-indisponible')
			return { ok: false }
		}
		await record('ok')
		return { ok: true, token }
	} catch (error) {
		await record(error instanceof SessionRefused ? error.code : 'service-indisponible')
		return { ok: false }
	}
}

export interface SessionAfterConfirmationInputs {
	payload: Payload
	/** The code of the cookie of the page, as it came. */
	code: unknown
	journal?: Log
	open?: OpenSession
	maintenantMs?: number
}

/**
 * The click of « Continuer » on the confirmation page. Claims the link (once, inside the window) and
 * opens the session. Anything that is not a link ours to claim gives `{ ok: false }`, and says nothing more.
 */
export async function openSessionAfterConfirmation({
	payload,
	code,
	journal,
	open,
	maintenantMs = Date.now(),
}: SessionAfterConfirmationInputs): Promise<LinkSessionOutcome> {
	const token = Array.isArray(code) ? code[0] : code
	if (typeof token !== 'string' || !CONFIRMATION_TOKEN.test(token)) return { ok: false }
	let claimed: { id: number | string } | null
	try {
		claimed = (await payload.db.updateOne({
			collection: 'pros',
			data: { _verificationToken: usageTrace(token) },
			options: { atomic: true },
			where: {
				and: [
					{ _verificationToken: { equals: pendingTrace(token) } },
					{ createdAt: { greater_than: new Date(maintenantMs - SESSION_OFFER_WINDOW_MS).toISOString() } },
				],
			},
		})) as { id: number | string } | null
	} catch {
		return { ok: false }
	}
	if (!claimed) return { ok: false }
	return openSessionForLink({ payload, accountId: claimed.id, origin: 'confirmation', journal, open })
}
