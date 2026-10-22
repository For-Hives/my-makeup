import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import type { Log } from './auth-log'
import { CONFIRMATION_TOKEN, sessionOfferOpen } from './confirmation-link'
import type { RateLimit } from './rate-limit'

/**
 * The confirmation of an email by the link of the mail (ticket 082).
 *
 * - The link carries the token Payload made when the account was created. Following it makes the
 *   account confirmed, once: the token is then replaced by the trace of its use, so that the same
 *   link, followed again, answers « déjà confirmé » and does nothing (a mail reader that opens the
 *   link before the person does, and the person who clicks twice, both end well). A link that no
 *   account knows answers « lien invalide ».
 * - The token is 40 hexadecimal characters. Anything else is refused before the database is asked.
 * - The trace is a hash of the token, never the token: a read of the table gives no working link.
 * - The claim is atomic (the token is in the condition of the write): two followers at the same instant
 *   get one « ok » (ticket 302). The address first becomes `pending:` (confirmed, the session of the link
 *   waits for a click, see `session-after-link.ts`), then `utilise:` when the click has been served.
 * - It writes through the database adapter, as Payload's own confirmation does: the token and the
 *   confirmed flag are not for any request to write, and a single account is concerned.
 *
 * The journal gets one row, with the outcome only. No `next` import.
 */

export type ConfirmationResult = 'ok' | 'deja-confirme' | 'lien-invalide'

/** What the page needs: the result, and whether it may offer to open the session (ticket 302). */
export interface ConfirmationOutcome {
	result: ConfirmationResult
	sessionOffered: boolean
}

const TOKEN = CONFIRMATION_TOKEN

const USED_PREFIX = 'utilise:'
/** The address is confirmed, the session of the link not yet claimed (ticket 302). */
const PENDING_PREFIX = 'pending:'

const hashOf = (jeton: string): string => createHash('sha256').update(jeton).digest('hex')

/** What stands in the token column once the link has been used. */
export const usageTrace = (jeton: string): string => `${USED_PREFIX}${hashOf(jeton)}`

/** What stands there once the address is confirmed and the session of the link is still to claim. */
export const pendingTrace = (jeton: string): string => `${PENDING_PREFIX}${hashOf(jeton)}`

type Row = { id: number; _verified?: boolean | null; _verificationToken?: string | null; createdAt?: string | null }

export async function confirmEmail(payload: Payload, code: unknown, journal?: Log): Promise<ConfirmationResult> {
	return (await confirmLink(payload, code, journal)).result
}

/** `confirmEmail`, with the answer to « may the page offer the session ». */
export async function confirmLink(
	payload: Payload,
	code: unknown,
	journal?: Log,
	maintenantMs: number = Date.now()
): Promise<ConfirmationOutcome> {
	const start = Date.now()
	const outcome = await confirm(payload, code, maintenantMs)
	try {
		await journal?.({ type: 'confirmation', code: outcome.result, durationMs: Date.now() - start })
	} catch {
		// The journal is not the confirmation's to fail.
	}
	return outcome
}

/**
 * `confirmLink` behind a brake by client address (ticket 084): past the limit, the answer is
 * « lien invalide » with no read of the table and no row in the journal, so that a script knocking
 * on the page with random codes fills neither.
 */
export async function confirmWithRateLimit(
	payload: Payload,
	code: unknown,
	frein: RateLimit,
	cle: string,
	journal?: Log
): Promise<ConfirmationOutcome> {
	if (!frein.prendre(cle).autorise) return { result: 'lien-invalide', sessionOffered: false }
	return confirmLink(payload, code, journal)
}

const INVALID: ConfirmationOutcome = { result: 'lien-invalide', sessionOffered: false }

async function confirm(payload: Payload, code: unknown, maintenantMs: number): Promise<ConfirmationOutcome> {
	const token = Array.isArray(code) ? code[0] : code
	if (typeof token !== 'string' || !TOKEN.test(token)) return INVALID
	const pending = pendingTrace(token)
	const used = usageTrace(token)
	const row = await payload.db.findOne<Row>({
		collection: 'pros',
		where: {
			or: [
				{ _verificationToken: { equals: token } },
				{ _verificationToken: { equals: pending } },
				{ _verificationToken: { equals: used } },
			],
		},
	})
	if (!row) return INVALID
	if (row._verificationToken === used) return { result: 'deja-confirme', sessionOffered: false }
	const offered = sessionOfferOpen(row.createdAt, maintenantMs)
	// Followed again before the click (a mail reader came first, or she opened the link twice): the offer stays.
	if (row._verificationToken === pending) return offered ? { result: 'ok', sessionOffered: true } : alreadyDone()
	if (row._verified === true) return alreadyDone()
	// Claims the link with the token in the condition: of two followers at the same instant, one finds it gone.
	const claimed = await payload.db.updateOne({
		collection: 'pros',
		data: { _verified: true, _verificationToken: pending, updatedAt: new Date(maintenantMs).toISOString() },
		options: { atomic: true },
		where: { and: [{ id: { equals: row.id } }, { _verificationToken: { equals: token } }] },
	})
	if (!claimed) return alreadyDone()
	return { result: 'ok', sessionOffered: offered }
}

const alreadyDone = (): ConfirmationOutcome => ({ result: 'deja-confirme', sessionOffered: false })
