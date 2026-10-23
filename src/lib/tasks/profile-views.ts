import type { Payload } from 'payload'
import { importInProgress } from '../import-context'
import { PROFILE_VIEWS_COLLECTION, viewsPurgeDay } from '../views/profile-views'
import type { DailyTask } from './daily'

/**
 * The purge of the counters of views (ticket 1001): a row is kept 92 days, then deleted, as the privacy
 * policy says. A row whose profile is gone (the database empties the link) goes too. Idempotent; it
 * does nothing while an import runs, and reports a number, never a row.
 */
export const purgeProfileViews: DailyTask = {
	nom: 'purge-profile-views',
	executer: async (payload: Payload, maintenant) => {
		if (importInProgress()) return 0
		const { docs } = await payload.delete({
			collection: PROFILE_VIEWS_COLLECTION,
			depth: 0,
			overrideAccess: true,
			select: { day: true },
			where: { or: [{ day: { less_than: viewsPurgeDay(maintenant) } }, { profile: { exists: false } }] },
		})
		return docs.length
	},
}
