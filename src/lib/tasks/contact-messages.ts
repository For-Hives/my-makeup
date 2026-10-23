import type { Payload } from 'payload'
import { importInProgress } from '../import-context'
import type { DailyTask } from './daily'

/**
 * The purge of the contact messages (ticket 162): the privacy policy promises that a message of the
 * contact form is kept 12 months after its reception, then deleted. The row goes whole (name, email,
 * phone, message), never a part of it.
 *
 * - The age is counted from the reception (`createdAt`), 12 calendar months back from the clock of
 *   the run: a message of 12 months and a day goes, one of 11 months stays, one of exactly 12 months
 *   stays until the next day.
 * - Only the type `contact`: the next types of `contact-requests` have their own promise and their own ticket.
 * - It does nothing while an import runs in this process (`importEnCours`): the next day's run takes
 *   what is past its date, since the task is idempotent.
 * - It reports a number, never a row.
 */

export const CONTACT_RETENTION_MONTHS = 12

/** The date before which a message is deleted: `maintenant` minus 12 calendar months, in UTC. */
export function contactPurgeThreshold(maintenant: Date): Date {
	const threshold = new Date(maintenant.getTime())
	const day = threshold.getUTCDate()
	// Day 1 first, so that 31 March minus a month does not spill over into the month after.
	threshold.setUTCDate(1)
	threshold.setUTCMonth(threshold.getUTCMonth() - CONTACT_RETENTION_MONTHS)
	const lastDay = new Date(Date.UTC(threshold.getUTCFullYear(), threshold.getUTCMonth() + 1, 0)).getUTCDate()
	threshold.setUTCDate(Math.min(day, lastDay))
	return threshold
}

export const purgeContactMessages: DailyTask = {
	nom: 'purge-messages-contact',
	executer: async (payload: Payload, maintenant) => {
		if (importInProgress()) return 0
		const { docs } = await payload.delete({
			collection: 'contact-requests',
			depth: 0,
			overrideAccess: true,
			select: { type: true },
			where: {
				and: [
					{ type: { equals: 'contact' } },
					{ createdAt: { less_than: contactPurgeThreshold(maintenant).toISOString() } },
				],
			},
		})
		return docs.length
	},
}
