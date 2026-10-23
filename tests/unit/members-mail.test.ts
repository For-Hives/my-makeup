import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { composerEmail } from '@/lib/emails/layout'
import { MEMBERS_ANNOUNCEMENT_SUBJECT, membersAnnouncementContent } from '@/lib/emails/members-announcement'
import { DEFAULT_LIMIT, MAX_LIMIT, MembersMailRefused, readArguments, sendPermission } from '@/lib/members-mail/gates'
import { planMembersMail } from '@/lib/members-mail/plan'
import { type MembersMailStore, runMembersMail } from '@/lib/members-mail/run'
import { openSendLog, SendLogRefused } from '@/lib/members-mail/send-log'
import { CONDITION_TEXTS, type ReminderSubject } from '@/lib/reminders/rules'
import { readUnsubscribeToken, unsubscribeToken } from '@/lib/reminders/token'
import { runCommand } from '../../scripts/members/command'

/**
 * Issue 998: the one mail to the members. The list (who gets what), the text, the gates of the real send and
 * the send log. Nothing here sends: the door is a double, and the tests count its calls.
 */

const NOW = new Date('2026-10-23T10:00:00.000Z')
const SITE = 'https://site.test'
const SECRET = 'secret-de-test-secret-de-test-secret-de-test'
const LONG_TEXT = 'Maquillage de mariée et de soirée, en studio ou à domicile. '.repeat(5)

const dirs: string[] = []
const tempDir = (): string => {
	const dir = mkdtempSync(path.join(tmpdir(), 'members-mail-'))
	dirs.push(dir)
	return dir
}
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const completeDocument = (): ReminderSubject['document'] => ({
	firstName: 'Fictive',
	lastName: 'Exemple',
	specialty: 'Maquillage mariée',
	description: LONG_TEXT,
	city: { name: 'Annecy', inseeCode: '74010' },
	mainPicture: 1,
	serviceOffers: [{ priceFrom: 80 }],
	networks: { instagram: 'https://instagram.com/fictive' },
})

function subject(profileId: number, over: Partial<ReminderSubject> = {}): ReminderSubject {
	return {
		profileId,
		status: 'published',
		document: { ...completeDocument(), description: '', serviceOffers: [] },
		profileUpdatedAt: '2026-10-01T00:00:00.000Z',
		account: { verified: true, blocked: false, lastSignInAt: null, createdAt: '2025-01-01T00:00:00.000Z' },
		state: null,
		...over,
	}
}

const link = (profileId: number): string =>
	`${SITE}/api/reminders/unsubscribe?token=${unsubscribeToken(SECRET, profileId)}`

describe('the text of the mail', () => {
	const email = composerEmail(
		membersAnnouncementContent({ missing: ['photoPrincipale', 'offreChiffree'], unsubscribeLink: link(7) }),
		SITE
	)

	test('the subject holds nothing personal, on one line', () => {
		expect(email.sujet).toBe(MEMBERS_ANNOUNCEMENT_SUBJECT)
		expect(email.sujet).not.toMatch(/[@\d\n]/)
	})

	test('it says what changed, the Facebook way out, the quotes to come and the missing list', () => {
		expect(email.texte).toContain('nouveau site')
		expect(email.texte).toContain('Mot de passe oublié')
		expect(email.texte).toContain('Google')
		expect(email.texte).toContain('Facebook')
		expect(email.texte).toContain('24 heures')
		expect(email.texte).toContain('devis')
		expect(email.texte).toContain(`- ${CONDITION_TEXTS.photoPrincipale}`)
		expect(email.texte).toContain(`- ${CONDITION_TEXTS.offreChiffree}`)
		expect(email.texte).not.toContain(CONDITION_TEXTS.canalDeContact)
	})

	test('accents come out whole in both parts, and the HTML part escapes the quotes', () => {
		for (const part of [email.texte, email.html]) {
			expect(part).toContain('Ouvrir mon espace')
			expect(part).not.toContain('Ã')
			expect(part).not.toContain('�')
		}
		expect(email.texte).toContain('« Mot de passe oublié »')
		expect(email.html).toContain('<html lang="fr">')
		expect(email.html).toContain('charset="utf-8"')
	})

	test('the links are absolute: the button, and the one-click unsubscribe in the footer', () => {
		expect(email.lien).toBe(`${SITE}/auth/profil`)
		expect(email.texte).toContain(link(7))
		expect(email.html).toContain(link(7).replaceAll('&', '&amp;'))
		const links = [...`${email.texte}\n${email.html}`.matchAll(/https?:\/\/[^\s"<)]+/g)].map(match => match[0])
		// The origin is compared, not the beginning of the text: `https://site.test.evil` also begins with the site.
		for (const found of links) expect(new URL(found).origin).toBe(new URL(SITE).origin)
	})

	test('it holds no name, and nothing of another profile: the other one’s token and number are absent', () => {
		const other = composerEmail(membersAnnouncementContent({ missing: ['specialite'], unsubscribeLink: link(8) }), SITE)
		expect(email.texte).not.toContain(unsubscribeToken(SECRET, 8))
		expect(email.html).not.toContain(unsubscribeToken(SECRET, 8))
		expect(other.texte).not.toContain(unsubscribeToken(SECRET, 7))
		expect(email.texte).not.toMatch(/Fictive|Exemple/)
		expect(readUnsubscribeToken(SECRET, new URL(link(7)).searchParams.get('token') ?? '')).toBe(7)
	})

	test('a complete profile gets the good news and no list', () => {
		const complete = composerEmail(membersAnnouncementContent({ missing: [], unsubscribeLink: link(1) }), SITE)
		expect(complete.texte).toContain('tout ce qu’il faut')
		expect(complete.texte).not.toMatch(/^- /m)
	})

	test('it gives no date for the quotes', () => {
		expect(email.texte).not.toMatch(
			/\b(janvier|février|mars|avril|mai|juin|juillet|août|septembre|novembre|décembre)\b/i
		)
	})
})

describe('who would receive the mail', () => {
	test('a confirmed, unblocked, subscribed account is on the list with what its profile lacks', () => {
		const plan = planMembersMail([subject(1)], new Set())
		expect(plan.eligible).toEqual([{ profileId: 1, missing: ['offreChiffree', 'descriptionLongue'] }])
	})

	test('a complete profile is on the list too, with nothing missing', () => {
		const plan = planMembersMail([subject(2, { document: completeDocument() })], new Set())
		expect(plan.eligible).toEqual([{ profileId: 2, missing: [] }])
		expect(plan.completeProfiles).toBe(1)
	})

	test('a profile with none of the conditions is on the list and lacks all six', () => {
		const plan = planMembersMail([subject(3, { document: {} })], new Set())
		expect(plan.eligible[0]?.missing.length).toBe(6)
	})

	test('every exclusion is counted under its reason, and only once', () => {
		const account = subject(1).account
		const plan = planMembersMail(
			[
				subject(1, { account: { ...account, verified: false } }),
				subject(2, { account: { ...account, blocked: true } }),
				subject(3, { state: { lastSentAt: null, unsubscribedAt: '2026-10-22T00:00:00.000Z' } }),
				subject(4, { document: { ...completeDocument(), specialty: 'CEO/CTO My Makeup' } }),
				subject(5),
				subject(6, { account: { ...account, verified: false, blocked: true } }),
			],
			new Set([5])
		)
		expect(plan.excluded).toEqual({ unconfirmed: 2, blocked: 1, unsubscribed: 1, internal: 1, alreadyHandled: 1 })
		expect(plan.eligible).toEqual([])
	})

	test('the lacks are counted by condition, from the single rule', () => {
		const plan = planMembersMail([subject(1), subject(2, { document: {} })], new Set())
		expect(plan.missingByCondition.photoPrincipale).toBe(1)
		expect(plan.missingByCondition.offreChiffree).toBe(2)
	})
})

describe('the gates of the real send', () => {
	const ARGUMENTS = ['--send', '--send-log', '/tmp/log.jsonl']

	test('by default nothing is permitted, and the cap is 50', () => {
		const args = readArguments([])
		expect(args).toBeDefined()
		expect(args && sendPermission(args, {})).toEqual({ send: false })
		expect(DEFAULT_LIMIT).toBe(50)
	})

	test('every incomplete set of gates refuses, never sends', () => {
		const on = { MEMBERS_MAIL_SEND: 'on' }
		const cases: [string[], Record<string, string>][] = [
			[['--send'], on],
			[['--send', '--send-log', '/tmp/log.jsonl'], {}],
			[['--send', '--send-log', '/tmp/log.jsonl'], { MEMBERS_MAIL_SEND: 'ON' }],
			[['--send', '--send-log', '/tmp/log.jsonl'], { MEMBERS_MAIL_SEND: 'true' }],
			[['--send', '--send-log', '/tmp/log.jsonl'], { MEMBERS_MAIL_SEND: ' on' }],
		]
		for (const [argv, env] of cases) {
			const args = readArguments(argv)
			expect(args).toBeDefined()
			expect(() => args && sendPermission(args, env)).toThrow(MembersMailRefused)
		}
	})

	test('the variable alone, or the log alone, send nothing and do not refuse: it is a list', () => {
		const withVariable = readArguments(['--send-log', '/tmp/log.jsonl'])
		expect(withVariable && sendPermission(withVariable, { MEMBERS_MAIL_SEND: 'on' })).toEqual({ send: false })
	})

	test('the three together permit the send, with the cap', () => {
		const args = readArguments([...ARGUMENTS, '--limit', '10'])
		expect(args && sendPermission(args, { MEMBERS_MAIL_SEND: 'on' })).toEqual({
			send: true,
			limit: 10,
			sendLog: path.resolve('/tmp/log.jsonl'),
		})
	})

	test('the cap is a whole number from 1 to the ceiling', () => {
		for (const bad of ['0', '-1', '1.5', 'abc', '', String(MAX_LIMIT + 1)])
			expect(readArguments(['--limit', bad])).toBeUndefined()
		expect(readArguments(['--limit', String(MAX_LIMIT)])?.limit).toBe(MAX_LIMIT)
	})

	test('an unknown option is not understood', () => {
		expect(readArguments(['--everyone'])).toBeUndefined()
		expect(readArguments(['--send', '--send'])).toBeDefined()
	})
})

describe('the send log', () => {
	test('an entry is on disk before the door is called, and a second run skips it', () => {
		const file = path.join(tempDir(), 'log.jsonl')
		const log = openSendLog(file)
		log.begin(12)
		expect(readFileSync(file, 'utf8')).toContain('"profile":12')
		log.finish(12, 'sent')
		log.close()
		const again = openSendLog(file)
		expect([...again.handled()]).toEqual([12])
		again.close()
	})

	test('a failure stays in the log and is not retried by itself', () => {
		const file = path.join(tempDir(), 'log.jsonl')
		const log = openSendLog(file)
		log.begin(3)
		log.finish(3, 'failed')
		log.close()
		const again = openSendLog(file)
		expect(again.handled().has(3)).toBe(true)
		again.close()
	})

	test('two runs at once are refused, and the lock goes with close', () => {
		const file = path.join(tempDir(), 'log.jsonl')
		const first = openSendLog(file)
		expect(() => openSendLog(file)).toThrow(SendLogRefused)
		first.close()
		openSendLog(file).close()
	})

	test('a stop file asks the run to end', () => {
		const file = path.join(tempDir(), 'log.jsonl')
		const log = openSendLog(file)
		expect(log.stopRequested()).toBe(false)
		writeFileSync(`${file}.stop`, '')
		expect(log.stopRequested()).toBe(true)
		log.close()
	})

	test('a log that is not ours is refused and says no line', () => {
		const file = path.join(tempDir(), 'log.jsonl')
		writeFileSync(file, 'ceci n’est pas du JSON secret@example.test\n')
		let message = ''
		try {
			openSendLog(file)
		} catch (error) {
			message = error instanceof Error ? error.message : ''
		}
		expect(message).not.toBe('')
		expect(message).not.toContain('secret@example.test')
	})
})

describe('the run', () => {
	function store(subjects: ReminderSubject[], addresses: Record<number, string | undefined> = {}): MembersMailStore {
		return {
			subjects: async () => subjects,
			recipient: async id => (id in addresses ? addresses[id] : `membre${id}@example.test`),
		}
	}
	const base = {
		now: NOW,
		site: SITE,
		unsubscribeLink: link,
		log: { info: () => undefined, erreur: () => undefined },
		pause: async () => undefined,
		hiddenProfiles: 0,
	}

	test('without a door, the run only reports, and the door is never asked', async () => {
		const report = await runMembersMail({ ...base, store: store([subject(1), subject(2)]), sending: null, limit: 50 })
		expect(report.mode).toBe('dry-run')
		expect(report.eligible).toBe(2)
		expect(report.sent).toBe(0)
		expect(report.eligibleProfileIds).toEqual([1, 2])
	})

	test('the report holds numbers and identifiers, never an address or a name', async () => {
		const report = await runMembersMail({ ...base, store: store([subject(1)]), sending: null, limit: 50 })
		const json = JSON.stringify(report)
		expect(json).not.toContain('@')
		expect(json).not.toMatch(/Fictive|Exemple|example\.test/)
	})

	test('a send goes in order of identifier, within the cap, and writes the log before each mail', async () => {
		const file = path.join(tempDir(), 'log.jsonl')
		const sendLog = openSendLog(file)
		const seenInLog: string[] = []
		const sent: string[] = []
		const report = await runMembersMail({
			...base,
			store: store([subject(3), subject(1), subject(2)]),
			limit: 2,
			sending: {
				sendLog,
				send: async email => {
					seenInLog.push(readFileSync(file, 'utf8').trim().split('\n').at(-1) ?? '')
					sent.push(email.a)
				},
			},
		})
		sendLog.close()
		expect(report.sent).toBe(2)
		expect(report.remaining).toBe(1)
		expect(sent).toEqual(['membre1@example.test', 'membre2@example.test'])
		expect(seenInLog[0]).toContain('"profile":1')
		expect(seenInLog[0]).toContain('"status":"attempt"')
	})

	test('a second pass never writes twice to the same account', async () => {
		const file = path.join(tempDir(), 'log.jsonl')
		const count: Record<string, number> = {}
		const subjects = [subject(1), subject(2), subject(3)]
		for (let pass = 0; pass < 3; pass++) {
			const sendLog = openSendLog(file)
			await runMembersMail({
				...base,
				store: store(subjects),
				limit: 2,
				sending: {
					sendLog,
					send: async email => {
						count[email.a] = (count[email.a] ?? 0) + 1
					},
				},
			})
			sendLog.close()
		}
		expect(Object.values(count)).toEqual([1, 1, 1])
	})

	test('a failure is logged as a failure, does not stop the batch and is not retried', async () => {
		const file = path.join(tempDir(), 'log.jsonl')
		const sendLog = openSendLog(file)
		const report = await runMembersMail({
			...base,
			store: store([subject(1), subject(2)]),
			limit: 5,
			sending: {
				sendLog,
				send: async email => {
					if (email.a.startsWith('membre1')) throw new Error(`échec pour ${email.a}`)
				},
			},
		})
		sendLog.close()
		expect(report.failed).toBe(1)
		expect(report.sent).toBe(1)
		expect(readFileSync(file, 'utf8')).not.toContain('@')
	})

	test('the log never holds an address', async () => {
		const file = path.join(tempDir(), 'log.jsonl')
		const sendLog = openSendLog(file)
		await runMembersMail({
			...base,
			store: store([subject(1)]),
			limit: 5,
			sending: { sendLog, send: async () => undefined },
		})
		sendLog.close()
		expect(readFileSync(file, 'utf8')).not.toMatch(/@|example\.test/)
	})

	test('a stop file ends the pass before the next mail', async () => {
		const file = path.join(tempDir(), 'log.jsonl')
		const sendLog = openSendLog(file)
		let calls = 0
		const report = await runMembersMail({
			...base,
			store: store([subject(1), subject(2), subject(3)]),
			limit: 5,
			sending: {
				sendLog,
				send: async () => {
					calls++
					writeFileSync(`${file}.stop`, '')
				},
			},
		})
		sendLog.close()
		expect(calls).toBe(1)
		expect(report.stopped).toBe(true)
	})

	test('an account without an address is logged as failed and nothing is sent to it', async () => {
		const file = path.join(tempDir(), 'log.jsonl')
		const sendLog = openSendLog(file)
		let calls = 0
		const report = await runMembersMail({
			...base,
			store: store([subject(1)], { 1: undefined }),
			limit: 5,
			sending: {
				sendLog,
				send: async () => {
					calls++
				},
			},
		})
		sendLog.close()
		expect(calls).toBe(0)
		expect(report.failed).toBe(1)
	})
})

describe('the command', () => {
	function setup() {
		const dir = tempDir()
		const reports: { path: string; content: string }[] = []
		const lines: string[] = []
		let doorCalls = 0
		let sent = 0
		let benchSamples = 0
		const deps = {
			store: {
				subjects: async () => [subject(1), subject(2)],
				recipient: async (id: number) => `membre${id}@example.test`,
			} satisfies MembersMailStore,
			hiddenProfiles: async () => 4,
			door: () => {
				doorCalls++
				return async () => {
					sent++
				}
			},
			secret: SECRET,
			site: SITE,
			now: NOW,
			writeReport: (file: string, content: string) => reports.push({ path: file, content }),
			openSendLog,
			benchSample: async () => {
				benchSamples++
			},
			print: (line: string) => lines.push(line),
			pause: async () => undefined,
		}
		return {
			dir,
			deps,
			reports,
			lines,
			counts: () => ({ doorCalls, sent, benchSamples }),
		}
	}

	test('with no option at all: a list, one report, no door built, zero sent', async () => {
		const { deps, reports, counts } = setup()
		const code = await runCommand([], {}, deps)
		expect(code).toBe(0)
		expect(counts()).toEqual({ doorCalls: 0, sent: 0, benchSamples: 0 })
		expect(reports.length).toBe(1)
		expect(reports[0]?.content).not.toContain('@')
		expect(JSON.parse(reports[0]?.content ?? '{}').mode).toBe('dry-run')
	})

	test('--send alone, or --send with the variable but no log: refused, zero sent, nothing written', async () => {
		for (const [argv, env] of [
			[['--send'], {}],
			[['--send'], { MEMBERS_MAIL_SEND: 'on' }],
			[['--send', '--send-log', 'x.jsonl'], {}],
		] as const) {
			const { deps, reports, counts } = setup()
			const code = await runCommand([...argv], { ...env }, deps)
			expect(code).toBe(1)
			expect(counts().sent).toBe(0)
			expect(counts().doorCalls).toBe(0)
			expect(reports.length).toBe(0)
		}
	})

	test('the variable alone does not send either', async () => {
		const { deps, counts } = setup()
		expect(await runCommand([], { MEMBERS_MAIL_SEND: 'on' }, deps)).toBe(0)
		expect(counts().sent).toBe(0)
	})

	test('the three gates together send, up to the cap', async () => {
		const { deps, dir, counts, lines } = setup()
		const file = path.join(dir, 'log.jsonl')
		const code = await runCommand(['--send', '--send-log', file, '--limit', '1'], { MEMBERS_MAIL_SEND: 'on' }, deps)
		expect(code).toBe(0)
		expect(counts().sent).toBe(1)
		expect(lines.join('\n')).not.toMatch(/@/)
	})

	test('the printed lines never hold an address, a name or a link', async () => {
		const { deps, lines } = setup()
		await runCommand([], {}, deps)
		expect(lines.join('\n')).not.toMatch(/@|https?:|token/)
	})

	test('--bench-sample writes one sample to the bench and reads no member', async () => {
		const { deps, counts, reports } = setup()
		let read = 0
		deps.store.subjects = async () => {
			read++
			return []
		}
		expect(await runCommand(['--bench-sample'], {}, deps)).toBe(0)
		expect(counts().benchSamples).toBe(1)
		expect(read).toBe(0)
		expect(reports.length).toBe(0)
	})

	test('an option not understood stops with code 2', async () => {
		const { deps, counts } = setup()
		expect(await runCommand(['--tous'], {}, deps)).toBe(2)
		expect(counts().sent).toBe(0)
	})
})
