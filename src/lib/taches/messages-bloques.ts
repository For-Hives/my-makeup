import type { Payload } from 'payload'
import { importEnCours } from '../contexte-import'
import type { TacheQuotidienne } from './quotidiennes'

/**
 * The recovery of the contact messages whose mail never got an answer (ticket 224, finding of tickets
 * 159 and 163). A message is stored `en-attente`, then its mail leaves after the answer to the visitor
 * (`after` of Next); the send has a deadline of 8 seconds and then says `envoye` or `echec`. If the
 * process stops between the two, nothing ever says: the row stays `en-attente`, the admin panel shows
 * « En cours d’envoi » for good, and the re-send only starts from `echec`.
 *
 * - A message `en-attente` for longer than `DELAI_DE_REPRISE_MS` (far above the 8 seconds of a send)
 *   goes to `echec`, which an admin can send again. The age is counted from the last write of the row
 *   (`updatedAt`): the re-send of an admin takes the message back to `en-attente` and writes that date,
 *   so a send that is still running is never cut short.
 * - Only the type `contact`, and only the state of the mail: the status of the message is left alone.
 * - It does nothing while an import runs in this process, and it is idempotent: a second run finds nothing.
 * - It reports a number, never a row.
 */

/** How long a mail may stay `en-attente`: 15 minutes, against the 8 seconds of the deadline of a send. */
export const DELAI_DE_REPRISE_MS = 15 * 60 * 1000

/** The date before which an `en-attente` row is stuck: `maintenant` minus the delay. */
export const seuilDeReprise = (maintenant: Date): Date => new Date(maintenant.getTime() - DELAI_DE_REPRISE_MS)

export const repriseDesMessagesBloques: TacheQuotidienne = {
	nom: 'reprise-messages-contact-bloques',
	executer: async (payload: Payload, maintenant) => {
		if (importEnCours()) return 0
		const { docs } = await payload.update({
			collection: 'demandes',
			depth: 0,
			overrideAccess: true,
			data: { etatMail: 'echec' },
			select: { etatMail: true },
			where: {
				and: [
					{ type: { equals: 'contact' } },
					{ etatMail: { equals: 'en-attente' } },
					{ updatedAt: { less_than: seuilDeReprise(maintenant).toISOString() } },
				],
			},
		})
		return docs.length
	},
}
