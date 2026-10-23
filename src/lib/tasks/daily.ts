import type { Payload } from 'payload'
import { AUTH_LOG_COLLECTION, purgeThreshold } from '../auth/auth-log'
import { purgeContactMessages } from './contact-messages'
import { purgeProfileViews } from './profile-views'
import { purgeQuoteRequests } from './quote-requests'
import { purgeReminderReports, remindersTask } from './reminders'
import { purgeSearchCounts } from './search-counts'
import { retryStuckMessages } from './stuck-messages'
import { purgeUnconfirmedAccounts } from './unconfirmed-accounts'

/**
 * The daily tasks of the application (ticket 077): the purges that keep a retention promise, one
 * after the other, once a day. The purge of the authentication journal is the first; the next
 * purges (the contact messages, the accounts never confirmed) add their entry to
 * `DAILY_TASKS` and nothing else.
 *
 * A task is idempotent: it removes what is past its date and stops there, so that running it twice,
 * or on two instances, does the same as running it once. It receives the clock, so a test plays any
 * day. It reports a number of rows, never a row.
 *
 * Who starts them: `startDailyTasks` (./planificateur.ts), from the server only.
 * No `next` import: the scripts and the tests load this file too.
 */

export interface DailyTask {
	/** A short name, written in the log. */
	nom: string
	/** Does the work for the day `maintenant`; gives the number of rows it removed or put right (the field is called `supprimes` in the result, as the first tasks only removed). */
	executer: (payload: Payload, maintenant: Date) => Promise<number>
}

/** Removes the rows of the authentication journal older than 90 days. */
export const purgeAuthLog: DailyTask = {
	nom: 'purge-journal-authentification',
	executer: async (payload, maintenant) => {
		const { docs } = await payload.delete({
			collection: AUTH_LOG_COLLECTION,
			depth: 0,
			overrideAccess: true,
			select: { type: true },
			where: { date: { less_than: purgeThreshold(maintenant).toISOString() } },
		})
		return docs.length
	},
}

/** Every daily task, in the order they run. A new purge is added here. */
export const DAILY_TASKS: readonly DailyTask[] = [
	purgeAuthLog,
	purgeUnconfirmedAccounts,
	purgeContactMessages,
	purgeSearchCounts,
	purgeProfileViews,
	purgeQuoteRequests,
	retryStuckMessages,
	remindersTask,
	purgeReminderReports,
]

export type TaskResult = { nom: string; supprimes: number } | { nom: string; echec: true }

/**
 * Runs the tasks one after the other. A task that fails is logged (its name, never its error: it
 * may quote a row) and the next one runs anyway.
 */
export async function runDailyTasks(
	payload: Payload,
	maintenant: Date = new Date(),
	taches: readonly DailyTask[] = DAILY_TASKS
): Promise<TaskResult[]> {
	const results: TaskResult[] = []
	for (const task of taches) {
		try {
			const deleted = await task.executer(payload, maintenant)
			payload.logger.info({ msg: `Tâche quotidienne ${task.nom} : ${deleted} ligne(s) traitée(s).` })
			results.push({ nom: task.nom, supprimes: deleted })
		} catch {
			payload.logger.error({ msg: `Tâche quotidienne ${task.nom} : échec.` })
			results.push({ nom: task.nom, echec: true })
		}
	}
	return results
}
