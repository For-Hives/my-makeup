import type { Payload } from 'payload'
import { QUOTE_REQUESTS_COLLECTION } from '../../collections/QuoteRequests'
import { importInProgress } from '../import-context'
import { quotePurgeThreshold } from '../quote/request'
import type { DailyTask } from './daily'

/**
 * The purge of the quote requests (issue 1003): the privacy policy promises that a request is kept 6 months
 * after its reception, then deleted. The row goes whole (name, email, telephone, message), never a part of it.
 *
 * - The age is counted from the reception (`createdAt`), 6 calendar months back from the clock of the run:
 *   a request of 6 months and a day goes, one of exactly 6 months stays until the next day.
 * - A row whose profile is gone (the database empties the link) goes too: nobody could read it any more.
 * - It does nothing while an import runs in this process; the task is idempotent. It reports a number, never a row.
 */
export const purgeQuoteRequests: DailyTask = {
	nom: 'purge-demandes-devis',
	executer: async (payload: Payload, maintenant) => {
		if (importInProgress()) return 0
		const { docs } = await payload.delete({
			collection: QUOTE_REQUESTS_COLLECTION,
			depth: 0,
			overrideAccess: true,
			select: { status: true },
			where: {
				or: [
					{ createdAt: { less_than: quotePurgeThreshold(maintenant).toISOString() } },
					{ profile: { exists: false } },
				],
			},
		})
		return docs.length
	},
}
