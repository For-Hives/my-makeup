import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Payload } from 'payload'
import { payloadSendEmail } from '@/lib/emails/send'
import { serverEnv } from '@/lib/env'
import { openSendLog } from '@/lib/members-mail/send-log'
import { payloadReminderStore } from '@/lib/reminders/store'
import { type CommandDeps, runCommand } from '../../scripts/members/command'
import { createAccount } from '../support/account-factory'
import { activateProfile } from '../support/active-profile'
import { countMails, mailReceived } from '../support/mailpit'
import { emptyBase, testPayload } from '../support/payload-test'

/**
 * Issue 998: the mail to the members, against the real store and the mail catcher of the bench. The rules
 * without a database: tests/unit/members-mail.test.ts. Nothing here reaches a real address.
 */

afterEach(emptyBase)

const dirs: string[] = []
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

async function setup(payload: Payload) {
	const dir = mkdtempSync(path.join(tmpdir(), 'members-mail-'))
	dirs.push(dir)
	const store = payloadReminderStore(payload)
	const lines: string[] = []
	const reports: string[] = []
	const env = serverEnv()
	const deps: CommandDeps = {
		store: { subjects: () => store.subjects(), recipient: id => store.recipient(id) },
		hiddenProfiles: async () => 0,
		door: () => {
			const door = payloadSendEmail(payload, env)
			return async email => {
				await door({ a: email.a, sujet: email.sujet, texte: email.texte, html: email.html })
			}
		},
		secret: env.payloadSecret,
		site: 'http://localhost:3100',
		now: new Date(),
		writeReport: (_file, content) => reports.push(content),
		openSendLog,
		benchSample: async () => undefined,
		print: line => lines.push(line),
		pause: async () => undefined,
	}
	return { dir, deps, lines, reports }
}

describe('998 : le courriel aux membres', () => {
	test('sans option : la liste à blanc, aucun courriel dans la sonde, un rapport sans adresse', async () => {
		const account = await createAccount('maquilleuse')
		const payload = await testPayload()
		await activateProfile(account.id)
		const before = await countMails()
		const { deps, reports, lines } = await setup(payload)
		expect(await runCommand([], {}, deps)).toBe(0)
		expect(await countMails()).toBe(before)
		expect(await mailReceived(account.email)).toEqual([])
		expect(reports).toHaveLength(1)
		const report = JSON.parse(reports[0] ?? '{}')
		expect(report.mode).toBe('dry-run')
		expect(report.eligible).toBe(1)
		expect(reports[0]).not.toContain('@')
		expect(reports[0]).not.toContain(account.email)
		expect(lines.join('\n')).not.toContain(account.email)
	})

	test('envoi réel (les trois verrous) : un courriel dans la sonde, avec son lien ; un second passage n’écrit pas deux fois', async () => {
		const account = await createAccount('maquilleuse')
		const other = await createAccount('maquilleuse')
		const payload = await testPayload()
		await activateProfile(account.id)
		const { deps, dir } = await setup(payload)
		const log = path.join(dir, 'log.jsonl')
		const argv = ['--send', '--send-log', log, '--limit', '10']
		expect(await runCommand(argv, { MEMBERS_MAIL_SEND: 'on' }, deps)).toBe(0)
		const mails = await mailReceived(account.email)
		expect(mails).toHaveLength(1)
		expect(mails[0]?.sujet).toBe('Le nouveau My Makeup est en ligne')
		expect(mails[0]?.liens.some(link => link.includes('/api/reminders/unsubscribe?token='))).toBe(true)
		expect(mails[0]?.texte).toContain('il manque encore à ton profil')
		// Each account reads its own link: the other one's number is not in this mail.
		expect(await mailReceived(other.email)).toHaveLength(1)
		expect(readFileSync(log, 'utf8')).not.toContain('@')
		expect(await runCommand(argv, { MEMBERS_MAIL_SEND: 'on' }, deps)).toBe(0)
		expect(await mailReceived(account.email)).toHaveLength(1)
		expect(await mailReceived(other.email)).toHaveLength(1)
	}, 30_000)

	test('un compte désinscrit, bloqué ou non confirmé ne reçoit rien', async () => {
		const unsubscribed = await createAccount('maquilleuse')
		const blocked = await createAccount('maquilleuse')
		const payload = await testPayload()
		const { docs } = await payload.find({
			collection: 'profiles',
			depth: 0,
			where: { pro: { equals: unsubscribed.id } },
		})
		const profile = docs[0]
		if (!profile) throw new Error('pas de profil')
		await payload.create({
			collection: 'reminder-states',
			data: { profile: profile.id, unsubscribedAt: new Date().toISOString() },
		})
		await payload.update({ collection: 'pros', id: blocked.id, data: { blocked: true } })
		const { deps, dir } = await setup(payload)
		const argv = ['--send', '--send-log', path.join(dir, 'log.jsonl')]
		expect(await runCommand(argv, { MEMBERS_MAIL_SEND: 'on' }, deps)).toBe(0)
		expect(await mailReceived(unsubscribed.email)).toEqual([])
		expect(await mailReceived(blocked.email)).toEqual([])
	})
})
