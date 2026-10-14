import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import type { Frein } from './frein'
import type { Journaliser } from './journal'

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

export type ResultatDeConfirmation = 'ok' | 'deja-confirme' | 'lien-invalide'

const JETON = /^[0-9a-f]{40}$/

const PREFIXE_UTILISE = 'utilise:'

/** What stands in the token column once the link has been used. */
const traceDUsage = (jeton: string): string => `${PREFIXE_UTILISE}${createHash('sha256').update(jeton).digest('hex')}`

type Ligne = { id: number; _verified?: boolean | null; _verificationToken?: string | null }

export async function confirmerLEmail(
	payload: Payload,
	code: unknown,
	journal?: Journaliser
): Promise<ResultatDeConfirmation> {
	const debut = Date.now()
	const resultat = await confirmer(payload, code)
	try {
		await journal?.({ type: 'confirmation', code: resultat === 'ok' ? 'ok' : resultat, dureeMs: Date.now() - debut })
	} catch {
		// The journal is not the confirmation's to fail.
	}
	return resultat
}

/**
 * `confirmerLEmail` behind a brake by client address (ticket 084): past the limit, the answer is
 * « lien invalide » with no read of the table and no row in the journal, so that a script knocking
 * on the page with random codes fills neither.
 */
export async function confirmerSousFrein(
	payload: Payload,
	code: unknown,
	frein: Frein,
	cle: string,
	journal?: Journaliser
): Promise<ResultatDeConfirmation> {
	if (!frein.prendre(cle).autorise) return 'lien-invalide'
	return confirmerLEmail(payload, code, journal)
}

async function confirmer(payload: Payload, code: unknown): Promise<ResultatDeConfirmation> {
	const jeton = Array.isArray(code) ? code[0] : code
	if (typeof jeton !== 'string' || !JETON.test(jeton)) return 'lien-invalide'
	const trace = traceDUsage(jeton)
	const ligne = await payload.db.findOne<Ligne>({
		collection: 'pros',
		where: { or: [{ _verificationToken: { equals: jeton } }, { _verificationToken: { equals: trace } }] },
	})
	if (!ligne) return 'lien-invalide'
	if (ligne._verificationToken === trace || ligne._verified === true) return 'deja-confirme'
	await payload.db.updateOne({
		collection: 'pros',
		data: { _verified: true, _verificationToken: trace, updatedAt: new Date().toISOString() },
		returning: false,
		where: { id: { equals: ligne.id } },
	})
	return 'ok'
}
