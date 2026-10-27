import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { ensureProfile } from '@/lib/dashboard/empty-profile'
import { artistProfile, type DashboardUser, profileId } from '@/lib/dashboard/my-profile'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'

/**
 * A profile made by the server for an account that has none (ticket 140): « Mon espace » asks for it on the
 * first visit of an account imported without one, so that she never reads that her profile is missing.
 */

afterEach(async () => {
	await emptyBase()
})

async function userOf(payload: Payload, compte: { id: number | string }): Promise<DashboardUser> {
	const doc = await payload.findByID({ collection: 'pros', id: compte.id, depth: 0, overrideAccess: true })
	return { ...doc, collection: 'pros' } as DashboardUser
}

const accountProfiles = async (compte: { id: number | string }) =>
	(
		await (
			await testPayload()
		).find({ collection: 'profiles', depth: 0, pagination: false, where: { pro: { equals: compte.id } } })
	).docs

describe('un compte importé sans profil : le profil vide est créé côté serveur', () => {
	test('un compte sans profil en reçoit un, une seule fois, et le slug vient de son nom', async () => {
		const account = await createAccount('maquilleuse-sans-profil')
		const payload = await testPayload()
		const user = await userOf(payload, account)
		expect(await accountProfiles(account)).toHaveLength(0)
		expect(await artistProfile(payload, user)).toBeNull()

		const id = await ensureProfile(payload, user)

		const profiles = await accountProfiles(account)
		expect(profiles).toHaveLength(1)
		expect(profiles[0]?.id).toBe(id ?? undefined)
		expect(profiles[0]?.slug).toBeTruthy()
		expect(profiles[0]?.status).toBe('draft')
		// She reads her own empty profile now.
		expect(await artistProfile(payload, user)).not.toBeNull()
	})

	test('deux appels au même moment ne font qu’un profil', async () => {
		const account = await createAccount('maquilleuse-sans-profil')
		const payload = await testPayload()
		const user = await userOf(payload, account)

		const [a, b] = await Promise.all([ensureProfile(payload, user), ensureProfile(payload, user)])

		expect(a).not.toBeNull()
		expect(a).toBe(b)
		expect(await accountProfiles(account)).toHaveLength(1)
	})

	test('un compte qui a son profil n’en reçoit pas un second', async () => {
		const account = await createAccount('maquilleuse')
		const payload = await testPayload()
		const before = (await accountProfiles(account))[0]?.id
		expect(await ensureProfile(payload, await userOf(payload, account))).toBe(before ?? null)
		expect(await accountProfiles(account)).toHaveLength(1)
	})

	test('un compte de l’administration n’en reçoit pas', async () => {
		const admin = await createAccount('admin')
		const payload = await testPayload()
		const doc = await payload.findByID({ collection: 'admins', id: admin.id, depth: 0, overrideAccess: true })
		const user = { ...doc, collection: 'admins' } as unknown as DashboardUser
		expect(await ensureProfile(payload, user)).toBeNull()
		expect(await profileId(payload, user)).toBeNull()
	})
})
