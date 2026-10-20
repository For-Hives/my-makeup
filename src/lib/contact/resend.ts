import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import type { ContactMessage } from './message'
import { type DispatchInput, dispatch } from './payload-send'
import type { MailState } from './states'

/**
 * The re-send of the mail of a contact message by an admin (ticket 163). No `next` import: the route of
 * the collection calls it, and so do the tests.
 *
 * - Only a message whose mail is in `failed` is sent again. The admin's click first takes the message
 *   (`reserver`: `failed` becomes `pending`, in one statement that tests the old state), then sends. A
 *   second click, a second tab, or a retry of the browser finds `pending` and sends nothing: a double
 *   click sends one mail. Once a send has ended in `failed` (also when the relay was slower than the 8 s
 *   deadline, and may still deliver late), a new click is a new send.
 * - The mail is the one of the first send, from what is stored. The row ends `sent` and `forwarded`, or
 *   `failed` again; the answer says which, so the panel shows the result.
 */

export type ResendResult =
	| { ok: true; etatMail: 'envoye' | 'echec' }
	| { ok: false; code: 'introuvable' | 'pas-en-echec' }

/** What the re-send reads and takes. The real one is `payloadResendStorage`. */
export interface ResendStorage {
	lire: (id: number) => Promise<{ message: ContactMessage; etatMail: MailState } | null>
	/** `failed` → `pending` in one step. True for the one caller that got it. */
	reserver: (id: number) => Promise<boolean>
}

export async function resendMessageEmail(
	id: number,
	rendu: { relecture: ResendStorage } & DispatchInput
): Promise<ResendResult> {
	const { relecture: reread, ...sending } = rendu
	const row = await reread.lire(id)
	if (row === null) return { ok: false, code: 'introuvable' }
	if (row.etatMail !== 'failed' || !(await reread.reserver(id))) return { ok: false, code: 'pas-en-echec' }
	return { ok: true, etatMail: await dispatch(id, row.message, sending) }
}

/** The reads and the take of the re-send, wired to a Payload instance (no access control: the route checked the admin). */
export function payloadResendStorage(payload: Payload): ResendStorage {
	return {
		lire: async id => {
			const row = await payload
				.findByID({ collection: 'contact-requests', id, depth: 0, disableErrors: true })
				.catch(() => null)
			if (!row) return null
			const { firstName, lastName, email, phone, message, mailStatus } = row
			return {
				message: { prenom: firstName, nom: lastName, email, telephone: phone, message },
				etatMail: mailStatus,
			}
		},
		reserver: async id => {
			const { rows } = await (payload.db as unknown as PostgresAdapter).pool.query(
				`UPDATE contact_requests SET mail_status = 'pending', updated_at = now() WHERE id = $1 AND mail_status = 'failed' RETURNING id`,
				[id]
			)
			return rows.length === 1
		},
	}
}
