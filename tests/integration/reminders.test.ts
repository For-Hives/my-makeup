import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { GET } from '@/app/api/reminders/unsubscribe/route'
import { deleteAccountAndDependents } from '@/lib/account/deletion'
import { payloadSendEmail } from '@/lib/emails/send'
import { serverEnv } from '@/lib/env'
import { runDailyTasks } from '@/lib/tasks/daily'
import { createRemindersTask, purgeReminderReports } from '@/lib/tasks/reminders'
import { createAccount, type TestAccount } from '../support/account-factory'
import { activateProfile } from '../support/active-profile'
import { mailReceived } from '../support/mailpit'
import { emptyBase, testPayload } from '../support/payload-test'

/**
 * Issue 1006: the reminders and the rule of 24 months, against the real store and the mail catcher of the
 * bench. The same rules without a database: tests/unit/reminders.test.ts. Nothing here reaches a real address.
 */

afterEach(emptyBase)

const LONG_TEXT = 'Maquillage de mariée et de soirée, en studio ou à domicile. '.repeat(5)
const DAY = 86_400_000

type Artist = TestAccount<'maquilleuse'>

/** A profile that misses two conditions: an offer with a price, and a way to reach her. */
async function closeToPublishable(): Promise<{ account: Artist; profileId: number; payload: Payload }> {
	const account = await createAccount('maquilleuse')
	const payload = await testPayload()
	await activateProfile(account.id)
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
	const profile = docs[0]
	if (!profile) throw new Error('pas de profil')
	await payload.update({ collection: 'profiles', id: profile.id, data: { description: LONG_TEXT } })
	return { account, profileId: profile.id, payload }
}

/** Twenty days from now: the profile has not been touched for more than 14 days. */
const later = (days = 20): Date => new Date(Date.now() + days * DAY)

const dryRun = () =>
	createRemindersTask({
		env: () => ({ ...serverEnv(), remindersSend: false }),
		door: () => {
			throw new Error('La porte des emails ne doit pas être construite quand REMINDERS_SEND est absent.')
		},
		site: () => 'http://localhost:3100',
	})

const sending = () =>
	createRemindersTask({
		env: () => ({ ...serverEnv(), remindersSend: true }),
		door: payloadSendEmail,
		site: () => 'http://localhost:3100',
	})

async function reports(payload: Payload) {
	return (await payload.find({ collection: 'reminder-reports', depth: 0, pagination: false })).docs
}

describe('1006 : la liste à blanc', () => {
	test('sans REMINDERS_SEND, le rapport nomme le profil par son numéro et aucun mail ne part', async () => {
		const { account, profileId, payload } = await closeToPublishable()
		const result = await runDailyTasks(payload, later(), [dryRun()])
		expect(result).toEqual([{ nom: 'relances-profils', supprimes: 0 }])
		const [report] = await reports(payload)
		expect(report?.incompleteIds).toEqual([profileId])
		expect(report?.incompleteCount).toBe(1)
		expect(report?.sentCount).toBe(0)
		expect(report?.sendEnabled).toBe(false)
		// Numbers and identifiers only: nothing of hers is in the row.
		expect(JSON.stringify(report)).not.toContain(account.email)
		expect(await mailReceived(account.email)).toEqual([])
		expect((await payload.find({ collection: 'reminder-states', depth: 0 })).docs).toEqual([])
	})

	test('un profil modifié depuis moins de 14 jours n’est pas dans la liste', async () => {
		const { payload } = await closeToPublishable()
		await runDailyTasks(payload, later(3), [dryRun()])
		expect((await reports(payload))[0]?.incompleteIds).toEqual([])
	})

	test('un profil masqué n’y est pas, ni son compte bloqué', async () => {
		const hidden = await closeToPublishable()
		await hidden.payload.update({ collection: 'profiles', id: hidden.profileId, data: { chosenStatus: 'hidden' } })
		const blocked = await closeToPublishable()
		await blocked.payload.update({ collection: 'pros', id: blocked.account.id, data: { blocked: true } })
		await runDailyTasks(blocked.payload, later(), [dryRun()])
		expect((await reports(blocked.payload))[0]?.incompleteIds).toEqual([])
	})

	test('deux passages le même jour font une seule ligne de rapport', async () => {
		const { payload } = await closeToPublishable()
		const when = later()
		await runDailyTasks(payload, when, [dryRun()])
		await runDailyTasks(payload, when, [dryRun()])
		expect(await reports(payload)).toHaveLength(1)
	})

	test('un compte sans activité depuis plus de 24 mois est listé ; le même compte, un mois plus tard après sa création, ne l’est pas', async () => {
		const { payload, profileId } = await closeToPublishable()
		await runDailyTasks(payload, later(), [dryRun()])
		expect((await reports(payload))[0]?.inactiveIds).toEqual([])
		// 25 months ahead: the account and its profile have had no activity since.
		await runDailyTasks(payload, new Date(Date.now() + 25 * 31 * DAY), [dryRun()])
		expect((await reports(payload)).flatMap(row => row.inactiveIds as number[])).toEqual([profileId])
	})
})

describe('1006 : l’envoi réel, derrière REMINDERS_SEND=on', () => {
	test('un mail part, sans rien de la maquilleuse dans l’objet, avec le lien de désinscription ; un second passage n’en envoie pas', async () => {
		const { account, profileId, payload } = await closeToPublishable()
		const when = later()
		await runDailyTasks(payload, when, [sending()])
		const mails = await mailReceived(account.email)
		expect(mails).toHaveLength(1)
		expect(mails[0]?.sujet).toBe('Il te manque peu de chose pour publier ton profil')
		expect(mails[0]?.texte).toContain('une prestation avec un prix')
		const link = mails[0]?.liens.find(candidate => candidate.includes('/api/reminders/unsubscribe'))
		expect(link).toBeDefined()
		const [state] = (await payload.find({ collection: 'reminder-states', depth: 0 })).docs
		expect(state?.profile).toBe(profileId)
		expect((await reports(payload))[0]).toMatchObject({ sentCount: 1, sendEnabled: true })

		await runDailyTasks(payload, new Date(when.getTime() + DAY), [sending()])
		expect(await mailReceived(account.email)).toHaveLength(1)
	})

	test('le lien de désinscription arrête les rappels pour de bon, sans connexion', async () => {
		const { account, profileId, payload } = await closeToPublishable()
		await runDailyTasks(payload, later(), [sending()])
		const link = (await mailReceived(account.email))[0]?.liens.find(candidate =>
			candidate.includes('/api/reminders/unsubscribe')
		)
		if (!link) throw new Error('pas de lien')
		const answer = await GET(new Request(link))
		expect(answer.status).toBe(200)
		expect(answer.headers.get('set-cookie')).toBeNull()
		const [state] = (await payload.find({ collection: 'reminder-states', depth: 0 })).docs
		expect(state?.unsubscribedAt).toBeTruthy()
		expect(state?.profile).toBe(profileId)
		// 200 days later, past the period of 90 days: she is still not reminded.
		await runDailyTasks(payload, later(200), [sending()])
		expect(await mailReceived(account.email)).toHaveLength(1)
		// The same link twice changes nothing.
		expect((await GET(new Request(link))).status).toBe(200)
	})

	test('un lien altéré est refusé et ne désinscrit personne', async () => {
		const { payload, profileId } = await closeToPublishable()
		const answer = await GET(
			new Request(`http://localhost:3100/api/reminders/unsubscribe?token=${profileId}.${'A'.repeat(43)}`)
		)
		expect(answer.status).toBe(400)
		expect((await payload.find({ collection: 'reminder-states', depth: 0 })).docs).toEqual([])
	})
})

describe('1006 : la conservation', () => {
	test('un rapport de plus de 92 jours est supprimé, un récent reste', async () => {
		const payload = await testPayload()
		const now = new Date('2026-10-23T10:00:00.000Z')
		for (const day of ['2026-07-20', '2026-07-24', '2026-10-22'])
			await payload.create({
				collection: 'reminder-reports',
				data: { day, incompleteCount: 0, inactiveCount: 0, sentCount: 0 },
			})
		const result = await runDailyTasks(payload, now, [purgeReminderReports])
		expect(result).toEqual([{ nom: 'purge-rapports-relances', supprimes: 1 }])
		expect((await reports(payload)).map(row => row.day).sort()).toEqual(['2026-07-24', '2026-10-22'])
	})

	test('la suppression d’un compte supprime l’état des rappels de son profil', async () => {
		const { account, profileId, payload } = await closeToPublishable()
		await payload.create({
			collection: 'reminder-states',
			data: { profile: profileId, lastSentAt: new Date().toISOString() },
		})
		await deleteAccountAndDependents(payload, account.id)
		expect((await payload.find({ collection: 'reminder-states', depth: 0 })).docs).toEqual([])
	})
})
