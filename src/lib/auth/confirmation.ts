import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import type { Log } from './auth-log'
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
 * - It writes through the database adapter, as Payload's own confirmation does: the token and the
 *   confirmed flag are not for any request to write, and a single account is concerned.
 *
 * The journal gets one row, with the outcome only. No `next` import.
 */

export type ConfirmationResult = 'ok' | 'deja-confirme' | 'lien-invalide'

const TOKEN = /^[0-9a-f]{40}$/

const USED_PREFIX = 'utilise:'

/** What stands in the token column once the link has been used. */
const traceDUsage = (jeton: string): string => `${USED_PREFIX}${createHash('sha256').update(jeton).digest('hex')}`

type Row = { id: number; _verified?: boolean | null; _verificationToken?: string | null }

export async function confirmEmail(payload: Payload, code: unknown, journal?: Log): Promise<ConfirmationResult> {
	const start = Date.now()
	const result = await confirm(payload, code)
	try {
		await journal?.({ type: 'confirmation', code: result === 'ok' ? 'ok' : result, durationMs: Date.now() - start })
	} catch {
		// The journal is not the confirmation's to fail.
	}
	return result
}

/**
 * `confirmEmail` behind a brake by client address (ticket 084): past the limit, the answer is
 * « lien invalide » with no read of the table and no row in the journal, so that a script knocking
 * on the page with random codes fills neither.
 */
export async function confirmWithRateLimit(
	payload: Payload,
	code: unknown,
	frein: RateLimit,
	cle: string,
	journal?: Log
): Promise<ConfirmationResult> {
	if (!frein.prendre(cle).autorise) return 'lien-invalide'
	return confirmEmail(payload, code, journal)
}

async function confirm(payload: Payload, code: unknown): Promise<ConfirmationResult> {
	const token = Array.isArray(code) ? code[0] : code
	if (typeof token !== 'string' || !TOKEN.test(token)) return 'lien-invalide'
	const trace = traceDUsage(token)
	const row = await payload.db.findOne<Row>({
		collection: 'pros',
		where: { or: [{ _verificationToken: { equals: token } }, { _verificationToken: { equals: trace } }] },
	})
	if (!row) return 'lien-invalide'
	if (row._verificationToken === trace || row._verified === true) return 'deja-confirme'
	await payload.db.updateOne({
		collection: 'pros',
		data: { _verified: true, _verificationToken: trace, updatedAt: new Date().toISOString() },
		returning: false,
		where: { id: { equals: row.id } },
	})
	return 'ok'
}
