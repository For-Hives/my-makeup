import type { Payload } from 'payload'
import { importEnCours } from '../contexte-import'
import type { DailyTask } from './daily'

/**
 * The recovery of the contact messages whose mail never got an answer (ticket 224, finding of tickets
 * 159 and 163). A message is stored `pending`, then its mail leaves after the answer to the visitor
 * (`after` of Next); the send has a deadline of 8 seconds and then says `sent` or `failed`. If the
 * process stops between the two, nothing ever says: the row stays `pending`, the admin panel shows
 * « En cours d’envoi » for good, and the re-send only starts from `failed`.
 *
 * - A message `pending` for longer than `RETRY_DELAY_MS` (far above the 8 seconds of a send)
 *   goes to `failed`, which an admin can send again. The age is counted from the last write of the row
 *   (`updatedAt`): the re-send of an admin takes the message back to `pending` and writes that date,
 *   so a send that is still running is never cut short.
 * - Only the type `contact`, and only the state of the mail: the status of the message is left alone.
 * - It does nothing while an import runs in this process, and it is idempotent: a second run finds nothing.
 * - It reports a number, never a row.
 */

/** How long a mail may stay `pending`: 15 minutes, against the 8 seconds of the deadline of a send. */
export const RETRY_DELAY_MS = 15 * 60 * 1000

/** The date before which a `pending` row is stuck: `maintenant` minus the delay. */
export const retryThreshold = (maintenant: Date): Date => new Date(maintenant.getTime() - RETRY_DELAY_MS)

export const retryStuckMessages: DailyTask = {
	nom: 'reprise-messages-contact-bloques',
	executer: async (payload: Payload, maintenant) => {
		if (importEnCours()) return 0
		const { docs } = await payload.update({
			collection: 'contact-requests',
			depth: 0,
			overrideAccess: true,
			data: { mailStatus: 'failed' },
			select: { mailStatus: true },
			where: {
				and: [
					{ type: { equals: 'contact' } },
					{ mailStatus: { equals: 'pending' } },
					{ updatedAt: { less_than: retryThreshold(maintenant).toISOString() } },
				],
			},
		})
		return docs.length
	},
}
