import { composerEmail, type EmailComposé } from '../emails/layout'
import { membersAnnouncementContent } from '../emails/members-announcement'
import type { Log } from '../emails/send'
import type { MissingCondition, ReminderSubject } from '../reminders/rules'
import { type ExclusionReason, type MembersPlan, planMembersMail } from './plan'
import type { SendLog } from './send-log'

/**
 * The run of the mail to the members (issue 998): draws up the list, builds the report, and, only when the
 * caller hands a `sending`, sends the mails within the cap, one by one, writing the send log before each.
 *
 * - « Dry-run » is the default: `sending` is `null` unless the command passed every gate
 *   (src/lib/members-mail/gates.ts decides, this file never reads the environment).
 * - The report holds numbers and profile numbers, never a name, an address or a text. Nor does the log.
 * - A mail that fails is logged as failed and the pass goes on. The error itself is never logged: it may
 *   quote an address.
 *
 * No `next` import, no Payload: the store is passed in.
 */

/** What the run reads. The real one wraps `payloadReminderStore` (scripts/members/mail.ts). */
export interface MembersMailStore {
	/** Every profile and account the rules read (the hidden profiles are left out). */
	subjects: () => Promise<ReminderSubject[]>
	/** The address of her account, read only at the moment a mail is sent. */
	recipient: (profileId: number) => Promise<string | undefined>
}

export type SendMail = (email: { a: string } & Pick<EmailComposé, 'sujet' | 'texte' | 'html'>) => Promise<void>

export interface Sending {
	sendLog: SendLog
	send: SendMail
}

export interface MembersMailReport {
	generatedAt: string
	mode: 'dry-run' | 'send'
	profilesRead: number
	hiddenProfiles: number
	eligible: number
	excluded: Record<ExclusionReason, number>
	completeProfiles: number
	missingByCondition: Record<MissingCondition, number>
	/** Profile numbers of the recipients, in order. Nothing else identifies a person here. */
	eligibleProfileIds: number[]
	/** The cap of the pass; `null` for a list. */
	limit: number | null
	sent: number
	failed: number
	/** Recipients still to write to after this pass. */
	remaining: number
	stopped: boolean
}

export interface RunInput {
	store: MembersMailStore
	now: Date
	/** `null`: dry-run, nothing leaves. */
	sending: Sending | null
	/** The profiles already in the send log, for a list drawn up without sending. */
	handled?: ReadonlySet<number>
	limit: number
	hiddenProfiles: number
	log: Log
	/** The address of the site, for the link of the button. */
	site: string
	/** The unsubscribe link of one profile. */
	unsubscribeLink: (profileId: number) => string
	/** The pause between two mails, so that the relay is not hammered. */
	pause: () => Promise<void>
}

function reportOf(
	plan: MembersPlan,
	input: RunInput,
	extra: Pick<MembersMailReport, 'sent' | 'failed' | 'remaining' | 'stopped'>
): MembersMailReport {
	return {
		generatedAt: input.now.toISOString(),
		mode: input.sending ? 'send' : 'dry-run',
		profilesRead: plan.profilesRead,
		hiddenProfiles: input.hiddenProfiles,
		eligible: plan.eligible.length,
		excluded: plan.excluded,
		completeProfiles: plan.completeProfiles,
		missingByCondition: plan.missingByCondition,
		eligibleProfileIds: plan.eligible.map(recipient => recipient.profileId),
		limit: input.sending ? input.limit : null,
		...extra,
	}
}

export async function runMembersMail(input: RunInput): Promise<MembersMailReport> {
	const { store, sending, limit, log, site, unsubscribeLink } = input
	const subjects = await store.subjects()
	const plan = planMembersMail(subjects, sending ? sending.sendLog.handled() : (input.handled ?? new Set()))

	let sent = 0
	let failed = 0
	let stopped = false
	let attempted = 0
	if (sending) {
		for (const recipient of plan.eligible.slice(0, limit)) {
			if (sending.sendLog.stopRequested()) {
				stopped = true
				break
			}
			if (attempted > 0) await input.pause()
			attempted++
			sending.sendLog.begin(recipient.profileId)
			try {
				const to = await store.recipient(recipient.profileId)
				if (to === undefined) throw new Error('no address')
				const email = composerEmail(
					membersAnnouncementContent({
						missing: recipient.missing,
						unsubscribeLink: unsubscribeLink(recipient.profileId),
					}),
					site
				)
				await sending.send({ a: to, sujet: email.sujet, texte: email.texte, html: email.html })
				sending.sendLog.finish(recipient.profileId, 'sent')
				sent++
			} catch {
				sending.sendLog.finish(recipient.profileId, 'failed')
				failed++
				log.erreur('Un courriel aux membres n’est pas parti (le détail n’est pas gardé : il peut citer une adresse).')
			}
		}
	}
	const report = reportOf(plan, input, {
		sent,
		failed,
		remaining: sending ? plan.eligible.length - attempted : plan.eligible.length,
		stopped,
	})
	log.info(
		`Courriel aux membres : ${report.eligible} destinataire(s), ${sent} envoyé(s), ${failed} en échec${sending ? '' : ' (liste à blanc, rien n’est envoyé)'}.`
	)
	return report
}
