import { describe, expect, test } from 'bun:test'
import { monthsBefore } from '@/lib/calendar'
import { composerEmail } from '@/lib/emails/layout'
import { reminderEmailContent } from '@/lib/emails/reminder'
import { parseServerEnv } from '@/lib/env'
import {
	INACTIVITY_MONTHS,
	inactivityThreshold,
	isInactive,
	missingConditions,
	REMINDER_IDLE_DAYS,
	REMINDER_PERIOD_DAYS,
	REMINDERS_PER_DAY,
	type ReminderSubject,
} from '@/lib/reminders/rules'
import { type ReminderStore, runReminders, type StoredReport } from '@/lib/reminders/run'
import { readUnsubscribeToken, unsubscribeToken } from '@/lib/reminders/token'
import { contactPurgeThreshold } from '@/lib/tasks/contact-messages'

/**
 * Issue 1006: the list of the profiles that would be reminded, and the 24-month rule, in « dry-run »
 * mode. Nothing leaves unless REMINDERS_SEND is exactly « on ». The same lines against the real store:
 * tests/integration/reminders.test.ts.
 */

const NOW = new Date('2026-10-23T10:00:00.000Z')
const DAY = 86_400_000
const daysAgo = (days: number): string => new Date(NOW.getTime() - days * DAY).toISOString()

const LONG_TEXT = 'Maquillage de mariée et de soirée, en studio ou à domicile. '.repeat(5)

/** A profile that meets the six conditions: nothing is missing. */
function completeDocument(): ReminderSubject['document'] {
	return {
		firstName: 'Fictive',
		lastName: 'Exemple',
		specialty: 'Maquillage mariée',
		description: LONG_TEXT,
		city: { name: 'Annecy', inseeCode: '74010' },
		mainPicture: 1,
		serviceOffers: [{ priceFrom: 80 }],
		networks: { instagram: 'https://instagram.com/fictive' },
	}
}

function subject(over: Partial<ReminderSubject> = {}): ReminderSubject {
	return {
		profileId: 1,
		status: 'published',
		document: { ...completeDocument(), description: '', serviceOffers: [] },
		profileUpdatedAt: daysAgo(REMINDER_IDLE_DAYS + 1),
		account: { verified: true, blocked: false, lastSignInAt: daysAgo(1), createdAt: daysAgo(400) },
		state: null,
		...over,
	}
}

describe('calendar months', () => {
	test('monthsBefore keeps the day, and the last day of a shorter month', () => {
		expect(monthsBefore(new Date('2026-10-23T10:00:00.000Z'), 24).toISOString()).toBe('2024-10-23T10:00:00.000Z')
		expect(monthsBefore(new Date('2026-03-31T10:00:00.000Z'), 1).toISOString()).toBe('2026-02-28T10:00:00.000Z')
		expect(monthsBefore(new Date('2028-02-29T10:00:00.000Z'), 24).toISOString()).toBe('2026-02-28T10:00:00.000Z')
	})

	test('the purge of the contact messages still counts 12 months through the same rule', () => {
		expect(contactPurgeThreshold(NOW).toISOString()).toBe(monthsBefore(NOW, 12).toISOString())
	})
})

describe('the profiles that miss one or two conditions', () => {
	test('a profile that misses two conditions is on the list, with what it misses', () => {
		expect(missingConditions(subject(), NOW)).toEqual(['offreChiffree', 'descriptionLongue'])
	})

	test('a publishable profile is not on the list', () => {
		expect(missingConditions(subject({ document: completeDocument() }), NOW)).toEqual([])
	})

	test('a profile that misses three conditions is left alone: she is far from it', () => {
		const document = { ...completeDocument(), description: '', serviceOffers: [], networks: {} }
		expect(missingConditions(subject({ document }), NOW)).toEqual([])
	})

	test('a profile with none of the conditions is left alone', () => {
		expect(missingConditions(subject({ document: {} }), NOW)).toEqual([])
	})

	test('a hidden profile is never reminded', () => {
		expect(missingConditions(subject({ status: 'hidden' }), NOW)).toEqual([])
	})

	test('an account that did not confirm its email, or that is blocked, is never reminded', () => {
		const account = subject().account
		expect(missingConditions(subject({ account: { ...account, verified: false } }), NOW)).toEqual([])
		expect(missingConditions(subject({ account: { ...account, blocked: true } }), NOW)).toEqual([])
	})

	test('an internal account of the team is never reminded', () => {
		const document = { ...subject().document, specialty: 'CEO/CTO My Makeup' }
		expect(missingConditions(subject({ document }), NOW)).toEqual([])
	})

	test('a profile she changed in the last 14 days is left in peace; at exactly 14 days it is on the list', () => {
		expect(missingConditions(subject({ profileUpdatedAt: daysAgo(REMINDER_IDLE_DAYS - 1) }), NOW)).toEqual([])
		expect(missingConditions(subject({ profileUpdatedAt: daysAgo(REMINDER_IDLE_DAYS) }), NOW).length).toBe(2)
	})

	test('one reminder at most for each period of 90 days', () => {
		const recently = { lastSentAt: daysAgo(REMINDER_PERIOD_DAYS - 1), unsubscribedAt: null }
		const long = { lastSentAt: daysAgo(REMINDER_PERIOD_DAYS), unsubscribedAt: null }
		expect(missingConditions(subject({ state: recently }), NOW)).toEqual([])
		expect(missingConditions(subject({ state: long }), NOW).length).toBe(2)
	})

	test('a profile that unsubscribed is never reminded again', () => {
		expect(missingConditions(subject({ state: { lastSentAt: null, unsubscribedAt: daysAgo(500) } }), NOW)).toEqual([])
	})
})

describe('the rule of 24 months without activity', () => {
	const idle = (months: Date, extra: Partial<ReminderSubject['account']> = {}): ReminderSubject =>
		subject({
			profileUpdatedAt: months.toISOString(),
			account: {
				verified: true,
				blocked: false,
				lastSignInAt: months.toISOString(),
				createdAt: months.toISOString(),
				...extra,
			},
		})

	test('the threshold is 24 calendar months back', () => {
		expect(INACTIVITY_MONTHS).toBe(24)
		expect(inactivityThreshold(NOW).toISOString()).toBe('2024-10-23T10:00:00.000Z')
	})

	test('a day short of 24 months is not inactive', () => {
		expect(isInactive(idle(new Date('2024-10-24T10:00:00.000Z')), NOW)).toBe(false)
	})

	test('exactly 24 months is not inactive yet', () => {
		expect(isInactive(idle(new Date('2024-10-23T10:00:00.000Z')), NOW)).toBe(false)
	})

	test('a day past 24 months is inactive', () => {
		expect(isInactive(idle(new Date('2024-10-22T10:00:00.000Z')), NOW)).toBe(true)
	})

	test('a recent sign-in, a recent save of the profile or a recent account keeps her active', () => {
		const old = new Date('2023-01-01T10:00:00.000Z').toISOString()
		const base = idle(new Date('2023-01-01T10:00:00.000Z'))
		expect(isInactive(base, NOW)).toBe(true)
		expect(isInactive({ ...base, account: { ...base.account, lastSignInAt: daysAgo(3) } }, NOW)).toBe(false)
		expect(isInactive({ ...base, profileUpdatedAt: daysAgo(3) }, NOW)).toBe(false)
		expect(isInactive({ ...base, account: { ...base.account, lastSignInAt: old, createdAt: daysAgo(3) } }, NOW)).toBe(
			false
		)
	})

	test('an account that never signed in counts from its creation', () => {
		const base = idle(new Date('2023-01-01T10:00:00.000Z'), { lastSignInAt: null })
		expect(isInactive(base, NOW)).toBe(true)
		expect(isInactive({ ...base, account: { ...base.account, createdAt: daysAgo(10) } }, NOW)).toBe(false)
	})

	test('a hidden profile, a blocked or unconfirmed account are not in the list', () => {
		const base = idle(new Date('2023-01-01T10:00:00.000Z'))
		expect(isInactive({ ...base, status: 'hidden' }, NOW)).toBe(false)
		expect(isInactive({ ...base, account: { ...base.account, blocked: true } }, NOW)).toBe(false)
		expect(isInactive({ ...base, account: { ...base.account, verified: false } }, NOW)).toBe(false)
	})
})

/** A store in memory and a mailer that counts: what the run touches, nothing else. */
function fixture(subjects: ReminderSubject[], existing: StoredReport | null = null) {
	const sent: { profileId: number; subject: string; to: string }[] = []
	const marked: number[] = []
	const reports: Record<string, StoredReport> = existing ? { [existing.day]: existing } : {}
	const store: ReminderStore = {
		subjects: async () => subjects,
		recipient: async profileId => `profil-${profileId}@example.test`,
		markSent: async (profileId, _at) => {
			marked.push(profileId)
		},
		readReport: async day => reports[day] ?? null,
		writeReport: async report => {
			reports[report.day] = report
		},
	}
	const send = async (email: { a: string; sujet: string }, profileId: number) => {
		sent.push({ profileId, subject: email.sujet, to: email.a })
	}
	return { store, sent, marked, reports, send }
}

const quiet = { info: () => undefined, erreur: () => undefined }
/** What the run needs of the site, whatever the store: the address and the link. */
const site = {
	site: 'https://exemple.test',
	unsubscribeLink: (profileId: number) => `https://exemple.test/api/reminders/unsubscribe?token=${profileId}.x`,
}

describe('the run of the day', () => {
	const incomplete = (profileId: number) => subject({ profileId })
	const inactive = (profileId: number) =>
		subject({
			profileId,
			document: completeDocument(),
			profileUpdatedAt: daysAgo(900),
			account: { verified: true, blocked: false, lastSignInAt: daysAgo(900), createdAt: daysAgo(1200) },
		})

	test('without the setting, it writes the report and sends nothing, whoever is on the list', async () => {
		const { store, sent, marked, reports } = fixture([incomplete(1), incomplete(2), inactive(3)])
		const report = await runReminders({ store, now: NOW, send: null, log: quiet, ...site })
		expect(sent).toEqual([])
		expect(marked).toEqual([])
		expect(report.incompleteIds).toEqual([1, 2])
		expect(report.inactiveIds).toEqual([3])
		expect(report.sentCount).toBe(0)
		expect(report.sendEnabled).toBe(false)
		expect(reports['2026-10-23']).toEqual(report)
	})

	test('the report holds numbers and identifiers, nothing else', async () => {
		const { store } = fixture([incomplete(7)])
		const report = await runReminders({ store, now: NOW, send: null, log: quiet, ...site })
		expect(Object.keys(report).sort()).toEqual(
			['day', 'incompleteCount', 'incompleteIds', 'inactiveCount', 'inactiveIds', 'sendEnabled', 'sentCount'].sort()
		)
		expect(JSON.stringify(report)).not.toContain('@')
	})

	test('with the setting, each profile gets one mail, marked as sent', async () => {
		const { store, sent, marked, send } = fixture([incomplete(1), incomplete(2)])
		const report = await runReminders({ store, now: NOW, send, log: quiet, ...site })
		expect(sent.map(mail => mail.profileId)).toEqual([1, 2])
		expect(marked).toEqual([1, 2])
		expect(report.sentCount).toBe(2)
		expect(report.sendEnabled).toBe(true)
	})

	test('the subject of the mail holds nothing of hers', async () => {
		const { store, sent, send } = fixture([incomplete(41)])
		await runReminders({ store, now: NOW, send, log: quiet, ...site })
		expect(sent[0]?.subject).toBe('Il te manque peu de chose pour publier ton profil')
	})

	test('a cap of 20 mails a day, counted across the runs of the same day', async () => {
		expect(REMINDERS_PER_DAY).toBe(20)
		const many = Array.from({ length: 30 }, (_, index) => incomplete(index + 1))
		const first = fixture(many)
		const report = await runReminders({ store: first.store, now: NOW, send: first.send, log: quiet, ...site })
		expect(first.sent).toHaveLength(20)
		expect(report.sentCount).toBe(20)
		// A second run the same day (the server restarted) finds the cap reached.
		const second = fixture(many.slice(20), first.reports['2026-10-23'] ?? null)
		const again = await runReminders({ store: second.store, now: NOW, send: second.send, log: quiet, ...site })
		expect(second.sent).toHaveLength(0)
		expect(again.sentCount).toBe(20)
	})

	test('a mail that fails is not marked as sent, and the next profile is tried', async () => {
		const { store, marked, sent } = fixture([incomplete(1), incomplete(2)])
		const failing = async (email: { a: string; sujet: string }, profileId: number) => {
			if (profileId === 1) throw new Error('relay down')
			sent.push({ profileId, subject: email.sujet, to: email.a })
		}
		const report = await runReminders({ store, now: NOW, send: failing, log: quiet, ...site })
		expect(marked).toEqual([2])
		expect(report.sentCount).toBe(1)
	})

	test('a profile on the 24-month list is never sent anything: the rule only lists', async () => {
		const { store, sent, send } = fixture([inactive(9)])
		const report = await runReminders({ store, now: NOW, send, log: quiet, ...site })
		expect(report.inactiveIds).toEqual([9])
		expect(sent).toEqual([])
	})
})

describe('the setting REMINDERS_SEND', () => {
	const valid = {
		DATABASE_URI: 'postgres://u:p@127.0.0.1:5442/b',
		PAYLOAD_SECRET: 'a'.repeat(40),
		NODE_ENV: 'test',
	}

	test('absent, empty or anything but « on »: off', () => {
		for (const REMINDERS_SEND of [undefined, '', '  ', 'off', 'ON', 'true', '1', 'yes', 'oui'])
			expect(parseServerEnv({ ...valid, REMINDERS_SEND }).remindersSend).toBe(false)
	})

	test('« on » exactly: on', () => {
		expect(parseServerEnv({ ...valid, REMINDERS_SEND: 'on' }).remindersSend).toBe(true)
		expect(parseServerEnv({ ...valid, REMINDERS_SEND: ' on ' }).remindersSend).toBe(true)
	})
})

describe('the mail', () => {
	test('it names what is missing in her words, with the way to unsubscribe, in the tone of « tu »', () => {
		const content = reminderEmailContent({
			missing: ['offreChiffree', 'descriptionLongue'],
			unsubscribeLink: 'https://exemple.test/api/reminders/unsubscribe?token=1.abc',
		})
		const mail = composerEmail(content, 'https://exemple.test')
		expect(mail.sujet).toBe('Il te manque peu de chose pour publier ton profil')
		expect(mail.texte).toContain('une prestation avec un prix')
		expect(mail.texte).toContain('une description d’au moins 200 caractères')
		expect(mail.texte).toContain('https://exemple.test/api/reminders/unsubscribe?token=1.abc')
		expect(mail.lien).toBe('https://exemple.test/auth/profil')
	})
})

describe('the unsubscribe link', () => {
	const secret = 's'.repeat(40)

	test('a token gives back its profile', () => {
		expect(readUnsubscribeToken(secret, unsubscribeToken(secret, 42))).toBe(42)
	})

	test('a token from another secret, altered or malformed, gives nothing', () => {
		const token = unsubscribeToken(secret, 42)
		expect(readUnsubscribeToken('t'.repeat(40), token)).toBeUndefined()
		expect(readUnsubscribeToken(secret, token.replace(/^42/, '43'))).toBeUndefined()
		expect(readUnsubscribeToken(secret, `${token}x`)).toBeUndefined()
		for (const bad of ['', 'abc', '42.', '.abc', '-1.abc', '4.2.abc'])
			expect(readUnsubscribeToken(secret, bad)).toBeUndefined()
	})
})
