import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { DEMO_PROFILES } from '../../src/demo-data/profiles'
import { setBenchDataset } from '../fixtures/bench-dataset'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'
import { emptyStorage } from '../support/s3'

/**
 * Issue 1005: hiding, suspending and restoring a profile need a reason typed in the same request, and
 * each action leaves one line in the moderation journal (who, what, why, when; numbers and the reason only).
 */

const resetToZero = () => Promise.all([emptyBase(), emptyStorage()])

beforeAll(async () => {
	await resetToZero()
	await setBenchDataset()
}, 60_000)

afterAll(resetToZero)

const REASON = 'Photos sans rapport avec le maquillage.'

async function referenceProfile(): Promise<number> {
	const slug = DEMO_PROFILES.find(({ cle }) => cle === 'reference')?.attendu.slug
	const payload = await testPayload()
	const found = await payload.find({ collection: 'profiles', where: { slug: { equals: slug } }, depth: 0, limit: 1 })
	return found.docs[0]?.id ?? 0
}

const moderationLog = async (profile: number) =>
	(
		await (
			await testPayload()
		).find({
			collection: 'moderation-events',
			where: { profile: { equals: profile } },
			sort: 'date',
			depth: 0,
			limit: 20,
		})
	).docs

describe('La modération d’un profil (issue 1005)', () => {
	test('masquer sans motif est refusé ; avec un motif, le profil est masqué et une ligne est écrite', async () => {
		const admin = await createAccount('admin')
		const headers = admin.session.enTetes
		const id = await referenceProfile()
		const payload = await testPayload()

		const refused = await callRest('PATCH', `/api/profiles/${id}`, {
			enTetes: headers,
			corps: { chosenStatus: 'hidden' },
		})
		expect(refused.statut).toBe(400)
		expect((await payload.findByID({ collection: 'profiles', id, depth: 0 })).status).toBe('published')
		expect(await moderationLog(id)).toHaveLength(0)

		const tooShort = await callRest('PATCH', `/api/profiles/${id}`, {
			enTetes: headers,
			corps: { chosenStatus: 'hidden', reason: 'non' },
		})
		expect(tooShort.statut).toBe(400)

		const hidden = await callRest('PATCH', `/api/profiles/${id}`, {
			enTetes: headers,
			corps: { chosenStatus: 'hidden', reason: REASON },
		})
		expect(hidden.statut).toBe(200)
		const stored = await payload.findByID({ collection: 'profiles', id, depth: 0 })
		expect([stored.status, stored.reason, stored.moderationAction]).toEqual(['hidden', REASON, 'hide'])
		const lines = await moderationLog(id)
		expect(lines).toHaveLength(1)
		expect(lines[0]).toMatchObject({ profile: id, admin: admin.id, action: 'hide', reason: REASON })
		expect(Object.keys(lines[0] ?? {}).sort()).toEqual(['action', 'admin', 'date', 'id', 'profile', 'reason'])
	}, 30_000)

	test('suspendre garde un autre mot, un autre motif, une autre ligne ; rétablir demande un motif et vide celui de la maquilleuse', async () => {
		const admin = await createAccount('admin')
		const headers = admin.session.enTetes
		const id = await referenceProfile()
		const payload = await testPayload()

		const suspended = await callRest('PATCH', `/api/profiles/${id}`, {
			enTetes: headers,
			corps: {
				chosenStatus: 'hidden',
				moderationAction: 'suspend',
				reason: 'Le profil enfreint les règles de publication.',
			},
		})
		expect(suspended.statut).toBe(200)
		expect((await payload.findByID({ collection: 'profiles', id, depth: 0 })).moderationAction).toBe('suspend')

		const sameReason = await callRest('PATCH', `/api/profiles/${id}`, {
			enTetes: headers,
			corps: { chosenStatus: 'automatic' },
		})
		expect(sameReason.statut).toBe(400)

		const restored = await callRest('PATCH', `/api/profiles/${id}`, {
			enTetes: headers,
			corps: { chosenStatus: 'automatic', reason: 'Photos remplacées, profil conforme.' },
		})
		expect(restored.statut).toBe(200)
		const stored = await payload.findByID({ collection: 'profiles', id, depth: 0 })
		expect([stored.status, stored.reason ?? null, stored.moderationAction ?? null]).toEqual(['published', null, null])
		expect((await moderationLog(id)).map(line => [line.action, line.reason])).toEqual([
			['hide', REASON],
			['suspend', 'Le profil enfreint les règles de publication.'],
			['restore', 'Photos remplacées, profil conforme.'],
		])
	}, 30_000)

	test('la maquilleuse lit le motif de son profil masqué, pas le journal', async () => {
		const admin = await createAccount('admin')
		const id = await referenceProfile()
		await callRest('PATCH', `/api/profiles/${id}`, {
			enTetes: admin.session.enTetes,
			corps: { chosenStatus: 'hidden', reason: REASON },
		})
		const payload = await testPayload()
		const owner = await payload.findByID({ collection: 'profiles', id, depth: 1 })
		const proId = typeof owner.pro === 'object' ? owner.pro.id : owner.pro
		const user = await payload.findByID({ collection: 'pros', id: proId, depth: 0 })
		const own = await payload.findByID({
			collection: 'profiles',
			id,
			depth: 0,
			overrideAccess: false,
			user: { ...user, collection: 'pros' },
		})
		expect(own.reason).toBe(REASON)
		await expect(
			payload.find({ collection: 'moderation-events', overrideAccess: false, user: { ...user, collection: 'pros' } })
		).rejects.toThrow()
	}, 30_000)
})
