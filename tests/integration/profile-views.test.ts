import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { POST } from '@/app/api/profile-views/route'
import { deleteAccountAndDependents } from '@/lib/account/deletion'
import { readMyViews } from '@/lib/dashboard/my-views'
import { runDailyTasks } from '@/lib/tasks/daily'
import { purgeProfileViews } from '@/lib/tasks/profile-views'
import { parisDay } from '@/lib/weekly-stats'
import { readWeeklyStats } from '@/services/analytics/weekly-stats'
import { createAccount, type TestAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'

/**
 * Ticket 1001: the daily counter of the views of a profile, against the real store. The same rules
 * without a database: tests/unit/profile-views.test.ts.
 */

afterEach(emptyBase)

const BROWSER = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

type Artist = TestAccount<'maquilleuse'>

async function profileOf(payload: Payload, account: Artist) {
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
	const [profile] = docs
	if (!profile) throw new Error('pas de profil')
	return profile
}

async function publishedArtist(status: 'published' | 'hidden' | 'draft' = 'published') {
	const account = await createAccount('maquilleuse')
	const payload = await testPayload()
	const profile = await profileOf(payload, account)
	await payload.update({
		collection: 'profiles',
		id: profile.id,
		data: { firstName: 'Léa', lastName: 'Fictive', specialty: 'Mariage', chosenStatus: status },
	})
	return { account, payload, profile: await profileOf(payload, account) }
}

const count = (slug: string, headers: Record<string, string> = {}) =>
	POST(
		new Request('http://localhost/api/profile-views', {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'user-agent': BROWSER, ...headers },
			body: JSON.stringify({ slug }),
		})
	)

async function rows(payload: Payload) {
	const { docs } = await payload.find({ collection: 'profile-views', depth: 0, pagination: false })
	return docs
}

describe('1001 : le compte d’une vue', () => {
	test('deux vues le même jour font une ligne et le nombre 2, sans cookie, sans rien d’autre que le profil, le jour et le nombre', async () => {
		const { payload, profile } = await publishedArtist()
		const first = await count(profile.slug)
		const second = await count(profile.slug)
		expect(first.status).toBe(204)
		expect(second.status).toBe(204)
		expect(first.headers.get('set-cookie')).toBeNull()
		const stored = await rows(payload)
		expect(stored).toHaveLength(1)
		expect(stored[0]).toMatchObject({ day: parisDay(new Date()), count: 2 })
		expect(Object.keys(stored[0] ?? {}).sort()).toEqual(['count', 'createdAt', 'day', 'id', 'profile', 'updatedAt'])
	})

	test('vingt vues en même temps font 20 : aucune n’est perdue', async () => {
		const { payload, profile } = await publishedArtist()
		await Promise.all(Array.from({ length: 20 }, () => count(profile.slug)))
		expect((await rows(payload))[0]?.count).toBe(20)
	})

	test('un automate, un outil et une requête sans agent ne comptent pas', async () => {
		const { payload, profile } = await publishedArtist()
		await count(profile.slug, { 'user-agent': 'Googlebot/2.1' })
		await count(profile.slug, { 'user-agent': 'curl/8.4.0' })
		await count(profile.slug, { 'user-agent': '' })
		expect(await rows(payload)).toHaveLength(0)
	})

	test('un profil masqué, un brouillon et un profil inconnu ne comptent pas, et la réponse ne les distingue pas', async () => {
		const hidden = await publishedArtist('hidden')
		const draft = await publishedArtist('draft')
		const answers = [await count(hidden.profile.slug), await count(draft.profile.slug), await count('inconnue-fictive')]
		expect(answers.map(({ status }) => status)).toEqual([204, 204, 204])
		expect(await rows(hidden.payload)).toHaveLength(0)
	})

	test('un corps qui n’est pas un slug est refusé (400), et rien n’est écrit', async () => {
		const { payload } = await publishedArtist()
		const response = await POST(
			new Request('http://localhost/api/profile-views', { method: 'POST', body: '{"slug":1,"x":2}' })
		)
		expect(response.status).toBe(400)
		expect(await rows(payload)).toHaveLength(0)
	})

	test('la propriétaire connectée et l’équipe ne comptent pas ; une autre maquilleuse connectée compte', async () => {
		const { payload, account, profile } = await publishedArtist()
		const other = await createAccount('maquilleuse')
		const admin = await createAccount('admin')
		await count(profile.slug, account.session.enTetes)
		await count(profile.slug, admin.session.enTetes)
		expect(await rows(payload)).toHaveLength(0)
		await count(profile.slug, other.session.enTetes)
		expect((await rows(payload))[0]?.count).toBe(1)
	})
})

describe('1001 : la lecture', () => {
	test('la maquilleuse lit les 30 jours de son profil, jamais ceux d’une autre', async () => {
		const mine = await publishedArtist()
		const hers = await publishedArtist()
		await count(mine.profile.slug)
		await count(mine.profile.slug)
		await count(hers.profile.slug)
		const days = await readMyViews(mine.payload, mine.profile.id)
		expect(days).toHaveLength(30)
		expect(days?.reduce((sum, { count: n }) => sum + n, 0)).toBe(2)
	})

	test('la route de statistiques donne le total et les jours, tous profils confondus', async () => {
		const mine = await publishedArtist()
		const hers = await publishedArtist()
		await count(mine.profile.slug)
		await count(hers.profile.slug)
		const now = new Date()
		const stats = await readWeeklyStats(
			mine.payload,
			{ debut: new Date(now.getTime() - 86_400_000), fin: new Date(now.getTime() + 86_400_000) },
			now
		)
		expect(stats.views).toEqual({ total: 2, byDay: { [parisDay(now)]: 2 } })
	})
})

describe('1001 : la conservation', () => {
	test('la purge supprime au-delà de 92 jours, garde le reste, et repasse sans rien changer', async () => {
		const { payload, profile } = await publishedArtist()
		const now = new Date('2026-10-23T10:00:00.000Z')
		for (const [day, n] of [
			['2026-07-22', 5],
			['2026-07-23', 6],
			['2026-10-23', 7],
		] as const)
			await payload.create({ collection: 'profile-views', data: { profile: profile.id, day, count: n } })
		expect(await runDailyTasks(payload, now, [purgeProfileViews])).toEqual([
			{ nom: 'purge-profile-views', supprimes: 1 },
		])
		expect((await rows(payload)).map(({ day }) => day).sort()).toEqual(['2026-07-23', '2026-10-23'])
		expect(await runDailyTasks(payload, now, [purgeProfileViews])).toEqual([
			{ nom: 'purge-profile-views', supprimes: 0 },
		])
	})

	test('les lignes partent avec le compte', async () => {
		const { payload, account, profile } = await publishedArtist()
		await count(profile.slug)
		expect(await rows(payload)).toHaveLength(1)
		await deleteAccountAndDependents(payload, account.id)
		expect(await rows(payload)).toHaveLength(0)
	})

	test('un profil supprimé sans passer par le compte laisse une ligne sans profil, que la purge emporte', async () => {
		const { payload, profile } = await publishedArtist()
		await count(profile.slug)
		await payload.db.pool.query('DELETE FROM profiles WHERE id = $1', [profile.id])
		const stored = await rows(payload)
		expect(stored).toHaveLength(1)
		expect(stored[0]?.profile).toBeNull()
		await runDailyTasks(payload, new Date(), [purgeProfileViews])
		expect(await rows(payload)).toHaveLength(0)
	})
})
