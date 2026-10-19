import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { type EntreesDExpedition, expedier } from './envoi-payload'
import type { EtatDuMail } from './etats'
import type { MessageDeContact } from './message'

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

export type ResultatDuRenvoi =
	| { ok: true; etatMail: 'envoye' | 'echec' }
	| { ok: false; code: 'introuvable' | 'pas-en-echec' }

/** What the re-send reads and takes. The real one is `stockageDuRenvoiDePayload`. */
export interface StockageDuRenvoi {
	lire: (id: number) => Promise<{ message: MessageDeContact; etatMail: EtatDuMail } | null>
	/** `failed` → `pending` in one step. True for the one caller that got it. */
	reserver: (id: number) => Promise<boolean>
}

export async function renvoyerLEmailDUnMessage(
	id: number,
	rendu: { relecture: StockageDuRenvoi } & EntreesDExpedition
): Promise<ResultatDuRenvoi> {
	const { relecture, ...envoi } = rendu
	const ligne = await relecture.lire(id)
	if (ligne === null) return { ok: false, code: 'introuvable' }
	if (ligne.etatMail !== 'failed' || !(await relecture.reserver(id))) return { ok: false, code: 'pas-en-echec' }
	return { ok: true, etatMail: await expedier(id, ligne.message, envoi) }
}

/** The reads and the take of the re-send, wired to a Payload instance (no access control: the route checked the admin). */
export function stockageDuRenvoiDePayload(payload: Payload): StockageDuRenvoi {
	return {
		lire: async id => {
			const ligne = await payload
				.findByID({ collection: 'contact-requests', id, depth: 0, disableErrors: true })
				.catch(() => null)
			if (!ligne) return null
			const { firstName, lastName, email, phone, message, mailStatus } = ligne
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
