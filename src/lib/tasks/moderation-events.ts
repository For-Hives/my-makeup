import type { Payload } from 'payload'
import { monthsBefore } from '../calendar'
import type { DailyTask } from './daily'

/**
 * The purge of the moderation journal (issue 1005, decision of 23/10/2026): a line is kept 60 calendar
 * months (five years) after its `date`, then deleted, as the privacy policy says.
 *
 * - A line dated exactly 60 months back stays until the next day; one a moment older goes.
 * - The line holds numbers and a reason only, so the deletion of an admin account does not touch it:
 *   the journal keeps the number of the account.
 * - Idempotent; it reports a number, never a row.
 */

export const MODERATION_RETENTION_MONTHS = 60

/** The date before which a line is deleted: `maintenant` minus 60 calendar months, in UTC. */
export function moderationPurgeThreshold(maintenant: Date): Date {
	return monthsBefore(maintenant, MODERATION_RETENTION_MONTHS)
}

export const purgeModerationEvents: DailyTask = {
	nom: 'purge-moderation-events',
	executer: async (payload: Payload, maintenant) => {
		const { docs } = await payload.delete({
			collection: 'moderation-events',
			depth: 0,
			overrideAccess: true,
			select: { action: true },
			where: { date: { less_than: moderationPurgeThreshold(maintenant).toISOString() } },
		})
		return docs.length
	},
}
