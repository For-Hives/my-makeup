import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { artistProfile, type DashboardUser } from '@/lib/dashboard/my-profile'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { saveIdentity } from '@/lib/dashboard/save-identity'
import { createAccount, type TestAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'

/**
 * The identity saved from her space (tickets 118 and 119; plan 02 U54, I02, I03, I19, U32): the
 * profile read and written is hers alone, the reserved fields are refused, the slug stays, and the
 * values given back are the ones the database holds.
 */

afterEach(emptyBase)

type Artist = TestAccount<'maquilleuse'>

/** The account as Payload hands it to a request: what the access rules read. */
async function userOf(payload: Payload, compte: Artist): Promise<DashboardUser> {
	const doc = await payload.findByID({ collection: 'pros', id: compte.id, depth: 0, overrideAccess: true })
	return { ...doc, collection: 'pros' } as DashboardUser
}

async function storedProfile(payload: Payload, compte: Artist) {
	const { docs } = await payload.find({
		collection: 'profiles',
		depth: 0,
		overrideAccess: true,
		where: { pro: { equals: compte.id } },
	})
	const profile = docs[0]
	if (!profile) throw new Error('pas de profil')
	return profile
}

const IDENTITY = { prenom: 'Léa', nom: 'Fictive', nomArtiste: 'Studio Fictif', specialite: 'Maquillage mariée' }

describe('U54 : la page ne lit que le profil de la maquilleuse connectée', () => {
	test('A lit le sien, jamais celui de B', async () => {
		const a = await createAccount('maquilleuse')
		const b = await createAccount('maquilleuse')
		const payload = await testPayload()
		await payload.update({
			collection: 'profiles',
			id: (await storedProfile(payload, b)).id,
			data: {
				firstName: IDENTITY.prenom,
				lastName: IDENTITY.nom,
				artistName: IDENTITY.nomArtiste,
				specialty: IDENTITY.specialite,
			},
		})

		const profileOfA = await artistProfile(payload, await userOf(payload, a))

		expect(profileOfA?.id).toBe((await storedProfile(payload, a)).id)
		expect(profileOfA?.lastName).not.toBe('Fictive')
		expect(JSON.stringify(profileOfA)).not.toContain('Studio Fictif')
		// Nothing the cards do not show: no account, no internal field, no slug.
		expect(Object.keys(profileOfA ?? {}).sort()).not.toContain('pro')
		expect(profileOfA).not.toHaveProperty('internalNote')
		expect(profileOfA).not.toHaveProperty('score')
	})

	test('un compte de l’administration n’a pas de profil de maquilleuse', async () => {
		const admin = await createAccount('admin')
		const payload = await testPayload()
		const doc = await payload.findByID({ collection: 'admins', id: admin.id, depth: 0, overrideAccess: true })
		const user = { ...doc, collection: 'admins' } as unknown as DashboardUser
		expect(await artistProfile(payload, user)).toBeNull()
	})
})

describe('E19 : l’identité enregistrée est celle de la base', () => {
	test('les valeurs rendues sont les valeurs stockées, rognées, et le profil de A seul a changé', async () => {
		const a = await createAccount('maquilleuse')
		const b = await createAccount('maquilleuse')
		const payload = await testPayload()
		const beforeB = await storedProfile(payload, b)

		const result = await saveIdentity(payload, await userOf(payload, a), {
			...IDENTITY,
			prenom: '  Léa  ',
		})

		expect(result).toEqual({ ok: true, valeurs: IDENTITY })
		expect(await storedProfile(payload, a)).toMatchObject({
			firstName: 'Léa',
			lastName: 'Fictive',
			artistName: 'Studio Fictif',
			specialty: 'Maquillage mariée',
		})
		expect(await storedProfile(payload, b)).toMatchObject({ firstName: beforeB.firstName, lastName: beforeB.lastName })
	})
})

describe('U32, I03, I02 : une requête forgée est refusée, rien ne change', () => {
	test.each([
		['status', 'published'],
		['verified', true],
		['score', 99],
		['pro', 1],
		['slug', 'pirate'],
		['id', 1],
		['superArtist', true],
	])('la clé réservée %s refuse la requête entière', async (cle, valeur) => {
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const before = await storedProfile(payload, a)

		const result = await saveIdentity(payload, await userOf(payload, a), {
			...IDENTITY,
			[cle]: valeur,
		})

		expect(result).toEqual({ ok: false, message: FAILURE_MESSAGE })
		const after = await storedProfile(payload, a)
		expect(after.updatedAt).toBe(before.updatedAt)
		expect(after.firstName).toBe(before.firstName)
		expect(after.slug).toBe(before.slug)
		expect(after.status).toBe(before.status)
		expect(after.verified).toBe(before.verified)
	})

	test('hors bornes : le message est sous le champ et la base ne bouge pas', async () => {
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const before = await storedProfile(payload, a)

		const result = await saveIdentity(payload, await userOf(payload, a), {
			...IDENTITY,
			nom: 'A',
			specialite: 'x'.repeat(71),
		})

		expect(result).toMatchObject({
			ok: false,
			champs: {
				nom: 'Ton nom doit contenir au moins 2 caractères.',
				specialite: 'Ta spécialité ne doit pas dépasser 70 caractères.',
			},
		})
		expect((await storedProfile(payload, a)).updatedAt).toBe(before.updatedAt)
	})

	test('un compte sans profil ne crée rien : message du site', async () => {
		const withoutProfile = await createAccount('maquilleuse-sans-profil')
		const payload = await testPayload()
		const doc = await payload.findByID({ collection: 'pros', id: withoutProfile.id, depth: 0, overrideAccess: true })
		const result = await saveIdentity(payload, { ...doc, collection: 'pros' } as DashboardUser, IDENTITY)
		expect(result).toEqual({ ok: false, message: FAILURE_MESSAGE })
		expect((await payload.count({ collection: 'profiles', overrideAccess: true })).totalDocs).toBe(0)
	})
})

describe('I19 : changer de nom ne change pas l’adresse du profil', () => {
	test('deux enregistrements de suite, le slug est celui de la création', async () => {
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const user = await userOf(payload, a)
		const slug = (await storedProfile(payload, a)).slug

		await Promise.all([
			saveIdentity(payload, user, IDENTITY),
			saveIdentity(payload, user, { ...IDENTITY, nom: 'Autre', prenom: 'Zoé' }),
		])

		const after = await storedProfile(payload, a)
		expect(after.slug).toBe(slug)
		expect(['Fictive', 'Autre']).toContain(after.lastName ?? '')
	})
})
