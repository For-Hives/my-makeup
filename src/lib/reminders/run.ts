import { composerEmail, type EmailComposé } from '../emails/layout'
import { reminderEmailContent } from '../emails/reminder'
import type { Log } from '../emails/send'
import { parisDay } from '../weekly-stats'
import { isInactive, type MissingCondition, missingConditions, REMINDERS_PER_DAY, type ReminderSubject } from './rules'

/**
 * The run of the day (issue 1006): draws up the two lists, writes the internal report, and, only when
 * the caller hands a `send`, sends the reminders of the first list, within the cap of the day.
 *
 * « Dry-run » is the default: `send` is `null` unless REMINDERS_SEND is « on » (src/lib/tasks/reminders.ts
 * decides, this file never reads the environment). With `send: null` the run touches nothing but the report.
 *
 * - The report holds numbers and profile identifiers, never a name, an address or a text.
 * - The cap counts the mails of the whole day, across runs: the server runs the tasks again after each
 *   start, and the report of the day remembers how many already left.
 * - A mail that fails is not marked as sent (the next day tries it again) and counts against the cap,
 *   so a relay that is down is not hammered. The error itself is never logged: it may quote an address.
 *
 * No `next` import, no Payload: the store is passed in.
 */

/** The report of one day, as it is stored: numbers and identifiers only. */
export interface StoredReport {
	/** The day of Paris, `AAAA-MM-JJ`. */
	day: string
	incompleteCount: number
	incompleteIds: number[]
	inactiveCount: number
	inactiveIds: number[]
	/** Reminders that left on this day, all runs together. */
	sentCount: number
	/** True when the last run of the day had the setting on. */
	sendEnabled: boolean
}

/** What the run reads and writes. The real one is `payloadReminderStore` (src/lib/reminders/store.ts). */
export interface ReminderStore {
	/** Every profile and account the rules read. */
	subjects: () => Promise<ReminderSubject[]>
	/** The address of her account, read only at the moment a mail is sent. */
	recipient: (profileId: number) => Promise<string | undefined>
	markSent: (profileId: number, at: Date) => Promise<void>
	readReport: (day: string) => Promise<StoredReport | null>
	writeReport: (report: StoredReport) => Promise<void>
}

/** The door of the mails, for one profile: the mail ready to leave and who it is for. */
export type SendReminder = (
	email: { a: string } & Pick<EmailComposé, 'sujet' | 'texte' | 'html'>,
	profileId: number
) => Promise<void>

export interface RunInput {
	store: ReminderStore
	now: Date
	/** `null`: dry-run, nothing leaves. */
	send: SendReminder | null
	log: Log
	/** The address of the site, for the link of the button. */
	site: string
	/** The unsubscribe link of one profile. */
	unsubscribeLink: (profileId: number) => string
	/** The cap of the day; `REMINDERS_PER_DAY` unless a test says otherwise. */
	cap?: number
}

export async function runReminders(input: RunInput): Promise<StoredReport> {
	const { store, now, send, log, site, unsubscribeLink, cap = REMINDERS_PER_DAY } = input
	const day = parisDay(now)
	const subjects = await store.subjects()

	const due: { profileId: number; missing: MissingCondition[] }[] = []
	const inactiveIds: number[] = []
	for (const subject of subjects) {
		const missing = missingConditions(subject, now)
		if (missing.length > 0) due.push({ profileId: subject.profileId, missing })
		if (isInactive(subject, now)) inactiveIds.push(subject.profileId)
	}
	due.sort((a, b) => a.profileId - b.profileId)
	inactiveIds.sort((a, b) => a - b)

	let sentToday = (await store.readReport(day))?.sentCount ?? 0
	let sentNow = 0
	if (send) {
		let attempts = sentToday
		for (const { profileId, missing } of due) {
			if (attempts >= cap) break
			attempts++
			try {
				const to = await store.recipient(profileId)
				if (to === undefined) continue
				const email = composerEmail(
					reminderEmailContent({ missing, unsubscribeLink: unsubscribeLink(profileId) }),
					site
				)
				await send({ a: to, sujet: email.sujet, texte: email.texte, html: email.html }, profileId)
				await store.markSent(profileId, now)
				sentNow++
			} catch {
				log.erreur('Un rappel de profil n’est pas parti (le détail n’est pas gardé : il peut citer une adresse).')
			}
		}
	}
	sentToday += sentNow

	const report: StoredReport = {
		day,
		incompleteCount: due.length,
		incompleteIds: due.map(entry => entry.profileId),
		inactiveCount: inactiveIds.length,
		inactiveIds,
		sentCount: sentToday,
		sendEnabled: send !== null,
	}
	await store.writeReport(report)
	log.info(
		`Rappels : ${report.incompleteCount} profil(s) à relancer, ${report.inactiveCount} inactif(s) depuis 24 mois, ${sentNow} mail(s) envoyé(s)${send ? '' : ' (liste à blanc, rien n’est envoyé)'}.`
	)
	return report
}
