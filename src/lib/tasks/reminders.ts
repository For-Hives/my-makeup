import type { Payload } from 'payload'
import { REMINDER_REPORTS_COLLECTION } from '../../collections/ReminderReports'
import { REMINDER_STATES_COLLECTION } from '../../collections/ReminderStates'
import { payloadSendEmail, type SendEmail } from '../emails/send'
import { type ServerEnv, SITE_ORIGIN, serverEnv } from '../env'
import { importInProgress } from '../import-context'
import { REPORT_RETENTION_DAYS } from '../reminders/rules'
import { runReminders, type SendReminder } from '../reminders/run'
import { payloadReminderStore } from '../reminders/store'
import { unsubscribeToken } from '../reminders/token'
import { parisDayBefore } from '../weekly-stats'
import type { DailyTask } from './daily'

/**
 * The reminders of the profiles that are close to publishable, and the rule of the 24 months of inactivity
 * (issue 1006). The task draws up the lists and writes the internal report every day (src/lib/reminders/run.ts).
 *
 * « Dry-run » is the state of the site: the task only reads profiles and accounts and writes its report.
 * Mails leave only when REMINDERS_SEND is exactly « on » (src/lib/env.ts), at most 20 a day, one for each
 * profile and each period of 90 days, each with its unsubscribe link. The rule of the 24 months never sends,
 * hides or deletes anything: it lists.
 *
 * It does nothing while an import runs in this process, and it reports the number of mails that left.
 */

/** What the task reads of the environment and uses to send: a test hands its own. */
export interface RemindersDeps {
	env: () => Pick<ServerEnv, 'remindersSend' | 'payloadSecret' | 'mail'>
	/** The door of the mails, built from Payload; only called when the setting is on. */
	door: (payload: Payload, env: Pick<ServerEnv, 'mail'>) => SendEmail
	site: () => string
}

const DEFAULT_DEPS: RemindersDeps = {
	env: serverEnv,
	door: payloadSendEmail,
	site: () => process.env.NEXT_PUBLIC_SITE_URL ?? SITE_ORIGIN,
}

export function createRemindersTask(deps: RemindersDeps = DEFAULT_DEPS): DailyTask {
	return {
		nom: 'relances-profils',
		executer: async (payload, maintenant) => {
			if (importInProgress()) return 0
			const env = deps.env()
			const site = deps.site()
			const door = env.remindersSend ? deps.door(payload, env) : null
			const send: SendReminder | null = door
				? async (email, _profileId) => {
						await door({ a: email.a, sujet: email.sujet, texte: email.texte, html: email.html })
					}
				: null
			const report = await runReminders({
				store: payloadReminderStore(payload),
				now: maintenant,
				send,
				site,
				unsubscribeLink: profileId =>
					`${site}/api/reminders/unsubscribe?token=${unsubscribeToken(env.payloadSecret, profileId)}`,
				log: {
					info: line => payload.logger.info({ msg: line }),
					erreur: line => payload.logger.error({ msg: line }),
				},
			})
			return report.sentCount
		},
	}
}

export const remindersTask: DailyTask = createRemindersTask()

/** The day before which a report is deleted: 92 days of the calendar back, counted on the day of Paris. */
export const reportsPurgeDay = (maintenant: Date): string => parisDayBefore(maintenant, REPORT_RETENTION_DAYS)

/**
 * The purge of the reports of the reminders: a row is kept 92 days, then deleted. The states of the profiles
 * that are gone (the database empties the link) go too. Idempotent; it does nothing while an import runs.
 */
export const purgeReminderReports: DailyTask = {
	nom: 'purge-rapports-relances',
	executer: async (payload: Payload, maintenant) => {
		if (importInProgress()) return 0
		const reports = await payload.delete({
			collection: REMINDER_REPORTS_COLLECTION,
			depth: 0,
			overrideAccess: true,
			select: { day: true },
			where: { day: { less_than: reportsPurgeDay(maintenant) } },
		})
		const orphans = await payload.delete({
			collection: REMINDER_STATES_COLLECTION,
			depth: 0,
			overrideAccess: true,
			select: {},
			where: { profile: { exists: false } },
		})
		return reports.docs.length + orphans.docs.length
	},
}
