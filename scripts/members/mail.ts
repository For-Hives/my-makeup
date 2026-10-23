/**
 * `bun run members:mail [options]`: the one mail to the members after the switch (issue 998;
 * docs/membres-courriel.md). By default a list: nothing is sent, a report of numbers and profile numbers is
 * written. The real send needs `--send`, `MEMBERS_MAIL_SEND=on`, a cap (`--limit`) and a send log.
 *
 * The database is the one `DATABASE_URI` names; a database that is not on this machine needs `--remote-target`
 * and `--expected-database <name>`, as for the import. The schema is never changed from here.
 * Started with `--no-env-file`: a working `.env` never reaches this command. On the bench, use
 * `bun run bench:members-mail`, which gives it the environment of the bench.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { MembersMailRefused, readArguments } from '../../src/lib/members-mail/gates'
import { openSendLog } from '../../src/lib/members-mail/send-log'
import { checkUpload } from '../../tests/support/environment-guard'
import { benchSink } from '../../tests/support/mailpit'
import { type CommandDeps, runCommand, runLight } from './command'

const TARGET_REFUSED =
	'La base visée est refusée : DATABASE_URI manque, ou la base n’est pas sur ce poste (alors --remote-target et --expected-database <nom> sont exigés). Rien n’est lu, rien n’est envoyé.'

const print = (line: string): void => console.log(line)

/** The pause between two mails: the relay is not hammered. */
const PAUSE_MS = 600

async function benchSample(email: Parameters<CommandDeps['benchSample']>[0]): Promise<void> {
	// Refuses unless the environment is the bench's: local relay, local catcher.
	let api: string
	try {
		checkUpload(process.env)
		api = benchSink(process.env).api
	} catch {
		throw new MembersMailRefused(
			'L’exemple ne s’écrit que dans la sonde de courrier du banc : lance `bun run bench:members-mail --bench-sample`, banc démarré. Rien n’est écrit.'
		)
	}
	const response = await fetch(`${api}/api/v1/send`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			From: { Email: 'ne-pas-repondre@example.test', Name: 'My Makeup' },
			To: [{ Email: email.a }],
			Subject: email.sujet,
			Text: email.texte,
			HTML: email.html,
		}),
	})
	if (!response.ok) throw new MembersMailRefused('La sonde de courrier du banc a refusé l’exemple.')
}

async function main(argv: string[]): Promise<number> {
	const args = readArguments(argv)
	const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL

	const light = await runLight(argv, { benchSample, print, site: siteOrigin ?? 'http://localhost:3100' })
	if (light !== undefined || !args) return light ?? 2

	// Before anything is loaded: the configuration of Payload connects to whatever DATABASE_URI names.
	const { verifyTarget, verifyExpectedDatabase, configurationWithoutSchemaChange, ImportRefuse } = await import(
		'../migration/import/target'
	)
	try {
		verifyTarget(process.env.DATABASE_URI, {
			remoteTarget: args.remoteTarget,
			expectedDatabase: args.expectedDatabase,
		})
	} catch (error) {
		if (!(error instanceof ImportRefuse)) throw error
		print(TARGET_REFUSED)
		return 1
	}

	const [
		{ getPayload },
		{ default: config },
		{ payloadReminderStore },
		{ payloadSendEmail },
		{ serverEnv, SITE_ORIGIN },
	] = await Promise.all([
		import('payload'),
		import('@payload-config'),
		import('../../src/lib/reminders/store'),
		import('../../src/lib/emails/send'),
		import('../../src/lib/env'),
	])
	const payload = await getPayload({ config: configurationWithoutSchemaChange(await config) })
	try {
		if (args.expectedDatabase !== undefined) {
			try {
				await verifyExpectedDatabase(payload, args.expectedDatabase)
			} catch (error) {
				if (!(error instanceof ImportRefuse)) throw error
				print(`La base visée n’est pas « ${args.expectedDatabase} » : rien n’est lu, rien n’est envoyé.`)
				return 1
			}
		}
		const env = serverEnv()
		const reminderStore = payloadReminderStore(payload)
		const deps: CommandDeps = {
			store: { subjects: () => reminderStore.subjects(), recipient: id => reminderStore.recipient(id) },
			hiddenProfiles: async () =>
				(
					await payload.count({
						collection: 'profiles',
						overrideAccess: true,
						where: { status: { equals: 'hidden' } },
					})
				).totalDocs,
			door: () => {
				const door = payloadSendEmail(payload, env)
				return async email => {
					await door({ a: email.a, sujet: email.sujet, texte: email.texte, html: email.html })
				}
			},
			secret: env.payloadSecret,
			site: siteOrigin ?? SITE_ORIGIN,
			now: new Date(),
			writeReport: (file, content) => {
				mkdirSync(path.dirname(file), { recursive: true })
				writeFileSync(file, content)
			},
			openSendLog,
			benchSample,
			print,
			pause: () => new Promise(resolve => setTimeout(resolve, PAUSE_MS)),
		}
		return await runCommand(argv, process.env, deps)
	} finally {
		await payload.destroy()
	}
}

try {
	process.exit(await main(process.argv.slice(2)))
} catch (error) {
	// An error of the database or of the relay may carry an address: only its type is printed.
	console.error(
		`La commande a échoué (${error instanceof Error ? error.name : 'erreur inconnue'}). Rien de plus n’est affiché.`
	)
	process.exit(3)
}
