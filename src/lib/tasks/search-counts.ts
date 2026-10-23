import type { Payload } from 'payload'
import { SEARCH_COUNT_COLLECTION, searchCountPurgeThreshold } from '../search/count'
import type { DailyTask } from './daily'

/**
 * The purge of the daily search counts (issue 1002): a row is kept 400 days after its day, then deleted
 * (the privacy policy says so). The rows hold numbers only; the purge keeps the table from growing for ever.
 * Idempotent, and it reports a number of rows.
 */
export const purgeSearchCounts: DailyTask = {
	nom: 'purge-compteurs-recherche',
	executer: async (payload: Payload, maintenant) => {
		const { docs } = await payload.delete({
			collection: SEARCH_COUNT_COLLECTION,
			depth: 0,
			overrideAccess: true,
			select: { total: true },
			where: { day: { less_than: searchCountPurgeThreshold(maintenant).toISOString() } },
		})
		return docs.length
	},
}
