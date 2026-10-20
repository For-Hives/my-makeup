import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import type { DashboardUser } from '@/lib/dashboard/my-profile'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { saveAvailability } from '@/lib/dashboard/save-availability'
import { LISTED_FILTER } from '@/lib/profile/visibility'
import { createAccount, type TestAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'

/**
 * The availability saved from her space (ticket 124; plan 02 E19-E29, U32, I02): hers alone, the
 * value given back is the stored one, a forged request changes nothing, and a profile with no
 * value stored (imported) is read as available.
 */

afterEach(emptyBase)

type Artist = TestAccount<'maquilleuse'>

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

describe('E19-E29 : la disponibilité enregistrée est celle de la base', () => {
	test('indisponible, puis disponible : la valeur rendue est la valeur stockée, le profil de B ne bouge pas', async () => {
		const a = await createAccount('maquilleuse')
		const b = await createAccount('maquilleuse')
		const payload = await testPayload()
		const user = await userOf(payload, a)
		const beforeB = await storedProfile(payload, b)
		const slug = (await storedProfile(payload, a)).slug

		expect(await saveAvailability(payload, user, { disponible: false })).toEqual({
			ok: true,
			valeurs: { disponible: false },
		})
		expect((await storedProfile(payload, a)).available).toBe(false)

		expect(await saveAvailability(payload, user, { disponible: true })).toEqual({
			ok: true,
			valeurs: { disponible: true },
		})
		const after = await storedProfile(payload, a)
		expect(after.available).toBe(true)
		expect(after.slug).toBe(slug)
		const afterB = await storedProfile(payload, b)
		expect(afterB.available).toBe(beforeB.available)
		expect(afterB.updatedAt).toBe(beforeB.updatedAt)
	})

	test('une valeur nulle importée est rendue « disponible » après une écriture qui ne la touche pas', async () => {
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const profile = await storedProfile(payload, a)
		await payload.db.updateOne({ collection: 'profiles', id: profile.id, data: { available: null }, returning: false })
		expect((await storedProfile(payload, a)).available ?? null).toBeNull()

		const result = await saveAvailability(payload, await userOf(payload, a), { disponible: true })
		expect(result).toEqual({ ok: true, valeurs: { disponible: true } })
	})
})

describe('E19-E29 : indisponible, le profil sort de la liste publique', () => {
	test('la liste le montre disponible, ne le montre plus indisponible, le montre de nouveau disponible', async () => {
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const user = await userOf(payload, a)
		const id = (await storedProfile(payload, a)).id
		await payload.update({
			collection: 'profiles',
			id,
			data: {
				firstName: 'Léa',
				lastName: 'Fictive',
				description: 'Maquillage fictif pour les mariages et les soirées. '.repeat(4),
				specialty: 'Mariée',
				skills: [{ name: 'Teint' }],
			},
		})
		const listed = async () =>
			(
				await payload.find({
					collection: 'profiles',
					depth: 0,
					limit: 1,
					overrideAccess: false,
					select: {},
					where: { and: [{ id: { equals: id } }, LISTED_FILTER] },
				})
			).totalDocs === 1

		expect(await listed()).toBe(true)
		await saveAvailability(payload, user, { disponible: false })
		expect(await listed()).toBe(false)
		await saveAvailability(payload, user, { disponible: true })
		expect(await listed()).toBe(true)
	})
})

describe('U32, I02 : une requête forgée est refusée, rien ne change', () => {
	test.each([
		['clé réservée', { disponible: false, status: 'published' }],
		['clé d’identifiant', { disponible: false, id: 1 }],
		['texte au lieu d’un booléen', { disponible: 'false' }],
		['rien', {}],
		['pas un objet', 'false'],
	])('%s', async (_nom, saisie) => {
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const before = await storedProfile(payload, a)

		const result = await saveAvailability(payload, await userOf(payload, a), saisie)

		expect(result).toEqual({ ok: false, message: FAILURE_MESSAGE })
		const after = await storedProfile(payload, a)
		expect(after.updatedAt).toBe(before.updatedAt)
		expect(after.available).toBe(before.available)
	})

	test('un compte sans profil ne crée rien', async () => {
		const withoutProfile = await createAccount('maquilleuse-sans-profil')
		const payload = await testPayload()
		const doc = await payload.findByID({ collection: 'pros', id: withoutProfile.id, depth: 0, overrideAccess: true })
		const result = await saveAvailability(payload, { ...doc, collection: 'pros' } as DashboardUser, {
			disponible: false,
		})
		expect(result).toEqual({ ok: false, message: FAILURE_MESSAGE })
		expect((await payload.count({ collection: 'profiles', overrideAccess: true })).totalDocs).toBe(0)
	})
})
