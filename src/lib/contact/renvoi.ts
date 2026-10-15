import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { type EntreesDExpedition, expedier } from './envoi-payload'
import type { EtatDuMail } from './etats'
import type { MessageDeContact } from './message'

/**
 * The re-send of the mail of a contact message by an admin (ticket 163). No `next` import: the route of
 * the collection calls it, and so do the tests.
 *
 * - Only a message whose mail is in `echec` is sent again. The admin's click first takes the message
 *   (`reserver`: `echec` becomes `en-attente`, in one statement that tests the old state), then sends. A
 *   second click, a second tab, or a retry of the browser finds `en-attente` and sends nothing: one click
 *   or ten, one mail.
 * - The mail is the one of the first send, from what is stored. The row ends `envoye` and `transmise`, or
 *   `echec` again; the answer says which, so the panel shows the result.
 */

export type ResultatDuRenvoi =
	| { ok: true; etatMail: 'envoye' | 'echec' }
	| { ok: false; code: 'introuvable' | 'pas-en-echec' }

/** What the re-send reads and takes. The real one is `stockageDuRenvoiDePayload`. */
export interface StockageDuRenvoi {
	lire: (id: number) => Promise<{ message: MessageDeContact; etatMail: EtatDuMail } | null>
	/** `echec` → `en-attente` in one step. True for the one caller that got it. */
	reserver: (id: number) => Promise<boolean>
}

export async function renvoyerLEmailDUnMessage(
	id: number,
	rendu: { relecture: StockageDuRenvoi } & EntreesDExpedition
): Promise<ResultatDuRenvoi> {
	const { relecture, ...envoi } = rendu
	const ligne = await relecture.lire(id)
	if (ligne === null) return { ok: false, code: 'introuvable' }
	if (ligne.etatMail !== 'echec' || !(await relecture.reserver(id))) return { ok: false, code: 'pas-en-echec' }
	return { ok: true, etatMail: await expedier(id, ligne.message, envoi) }
}

/** The reads and the take of the re-send, wired to a Payload instance (no access control: the route checked the admin). */
export function stockageDuRenvoiDePayload(payload: Payload): StockageDuRenvoi {
	return {
		lire: async id => {
			const ligne = await payload
				.findByID({ collection: 'demandes', id, depth: 0, disableErrors: true })
				.catch(() => null)
			if (!ligne) return null
			const { prenom, nom, email, telephone, message, etatMail } = ligne
			return { message: { prenom, nom, email, telephone, message }, etatMail }
		},
		reserver: async id => {
			const { rows } = await (payload.db as unknown as PostgresAdapter).pool.query(
				`UPDATE demandes SET etat_mail = 'en-attente', updated_at = now() WHERE id = $1 AND etat_mail = 'echec' RETURNING id`,
				[id]
			)
			return rows.length === 1
		},
	}
}
