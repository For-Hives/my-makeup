/**
 * The command `bun run members:mail`, apart from the world (issue 998): arguments, gates, run, report. What
 * touches the world (the database, the door of the mails, the files, the bench) is handed in as `deps`, so
 * that a test plays the whole command and counts what leaves.
 *
 * Exit codes: 0 done (a list, a pass, a sample); 1 refused, nothing sent (the message says why); 2 command line
 * not understood. Everything printed is a number or a sentence: never an address, a name or a link.
 */

import { existsSync } from 'node:fs'
import { composerEmail } from '../../src/lib/emails/layout'
import { membersAnnouncementContent } from '../../src/lib/emails/members-announcement'
import { MembersMailRefused, readArguments, sendPermission, USAGE } from '../../src/lib/members-mail/gates'
import { type MembersMailStore, runMembersMail, type SendMail } from '../../src/lib/members-mail/run'
import { type SendLog, SendLogRefused } from '../../src/lib/members-mail/send-log'
import { unsubscribeToken as unsubscribeTokenOf } from '../../src/lib/reminders/token'

/** The address of the sample mail: a reserved domain, which nobody owns. */
export const SAMPLE_RECIPIENT = 'exemple@example.test'

export interface CommandDeps {
	store: MembersMailStore
	hiddenProfiles: () => Promise<number>
	/** Builds the door of the mails. Called only when every gate of the send is shut. */
	door: () => SendMail
	secret: string
	site: string
	now: Date
	writeReport: (file: string, content: string) => void
	openSendLog: (file: string) => SendLog
	/** Puts one mail in the mail catcher of the bench. Refuses when the environment is not the bench. */
	benchSample: (email: Parameters<SendMail>[0]) => Promise<void>
	print: (line: string) => void
	pause: () => Promise<void>
}

/** What the usage and the bench sample need: no database, no member read. */
export type LightDeps = Pick<CommandDeps, 'benchSample' | 'print' | 'site'>

/**
 * The command lines that read no member: not understood (code 2) and the sample for the bench. `undefined`
 * when the command line is a list or a send, which needs the database.
 */
export async function runLight(argv: readonly string[], deps: LightDeps): Promise<number | undefined> {
	const args = readArguments(argv)
	if (!args) {
		deps.print(USAGE)
		return 2
	}
	if (!args.benchSample) return undefined
	// A made-up profile that lacks two conditions, a made-up link: no member is read.
	const email = composerEmail(
		membersAnnouncementContent({
			missing: ['photoPrincipale', 'offreChiffree'],
			unsubscribeLink: `${deps.site}/api/reminders/unsubscribe?token=exemple`,
		}),
		deps.site
	)
	try {
		await deps.benchSample({ a: SAMPLE_RECIPIENT, sujet: email.sujet, texte: email.texte, html: email.html })
	} catch (error) {
		if (!(error instanceof MembersMailRefused)) throw error
		deps.print(error.message)
		return 1
	}
	deps.print('Un courriel d’exemple a été écrit dans la sonde de courrier du banc.')
	return 0
}

export async function runCommand(
	argv: readonly string[],
	env: Readonly<Record<string, string | undefined>>,
	deps: CommandDeps
): Promise<number> {
	const light = await runLight(argv, deps)
	if (light !== undefined) return light
	const args = readArguments(argv)
	if (!args) return 2

	let sendLog: SendLog | undefined
	try {
		const permission = sendPermission(args, env)
		if (permission.send) sendLog = deps.openSendLog(permission.sendLog)
		else if (args.sendLog !== undefined && existsSync(args.sendLog)) sendLog = deps.openSendLog(args.sendLog)

		const report = await runMembersMail({
			store: deps.store,
			now: deps.now,
			sending: permission.send && sendLog ? { sendLog, send: deps.door() } : null,
			...(sendLog && { handled: sendLog.handled() }),
			limit: permission.send ? permission.limit : args.limit,
			hiddenProfiles: await deps.hiddenProfiles(),
			log: { info: deps.print, erreur: deps.print },
			site: deps.site,
			unsubscribeLink: profileId =>
				`${deps.site}/api/reminders/unsubscribe?token=${unsubscribeTokenOf(deps.secret, profileId)}`,
			pause: deps.pause,
		})
		deps.writeReport(args.report, `${JSON.stringify(report, null, 2)}\n`)
		deps.print(
			`Rapport : ${report.eligible} destinataire(s) sur ${report.profilesRead} profil(s) lus, ${report.sent} envoyé(s), ${report.failed} en échec, ${report.remaining} restant(s)${report.stopped ? ', passe arrêtée' : ''}.`
		)
		return 0
	} catch (error) {
		if (error instanceof MembersMailRefused || error instanceof SendLogRefused) {
			deps.print(error.message)
			return 1
		}
		throw error
	} finally {
		sendLog?.close()
	}
}
