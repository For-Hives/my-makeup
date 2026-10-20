import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import type { DashboardUser } from '@/lib/dashboard/my-profile'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { saveDescription } from '@/lib/dashboard/save-description'
import { createAccount, type TestAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'

/**
 * The description saved from her space (ticket 122; plan 02 E19-E29 description, U27, U32, I02): the
 * text is stored with its line breaks, the HTML is removed, 2 001 characters are refused, and the
 * value given back is the one the database holds.
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

describe('E19-E29 : la description enregistrée est celle de la base', () => {
	test('le texte est stocké avec ses sauts de ligne, rendu tel que stocké, le profil de B ne bouge pas', async () => {
		const a = await createAccount('maquilleuse')
		const b = await createAccount('maquilleuse')
		const payload = await testPayload()
		const beforeB = await storedProfile(payload, b)

		const result = await saveDescription(payload, await userOf(payload, a), {
			description: '  Maquilleuse mariée.\r\n\r\nJe me déplace dans toute la région.  ',
		})

		const expected = 'Maquilleuse mariée.\n\nJe me déplace dans toute la région.'
		expect(result).toEqual({ ok: true, valeurs: { description: expected } })
		expect((await storedProfile(payload, a)).description).toBe(expected)
		expect((await storedProfile(payload, b)).description).toBe(beforeB.description)
	})

	test('une description vide efface le texte', async () => {
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const user = await userOf(payload, a)
		await saveDescription(payload, user, { description: 'Un texte' })

		const result = await saveDescription(payload, user, { description: '   ' })

		expect(result).toEqual({ ok: true, valeurs: { description: '' } })
		expect((await storedProfile(payload, a)).description ?? '').toBe('')
	})
})

describe('U27 : 2 000 caractères au plus, HTML retiré', () => {
	test('2 000 sont stockés, 2 001 sont refusés et l’ancien texte reste', async () => {
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const user = await userOf(payload, a)

		const good = await saveDescription(payload, user, { description: 'a'.repeat(2000) })
		expect(good.ok).toBe(true)
		const before = await storedProfile(payload, a)

		const refusal = await saveDescription(payload, user, { description: 'b'.repeat(2001) })
		expect(refusal).toMatchObject({
			ok: false,
			champs: { description: 'Ta description ne doit pas dépasser 2000 caractères.' },
		})
		const after = await storedProfile(payload, a)
		expect(after.description).toBe('a'.repeat(2000))
		expect(after.updatedAt).toBe(before.updatedAt)
	})

	test('le HTML collé est retiré avant d’être stocké', async () => {
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()

		const result = await saveDescription(payload, await userOf(payload, a), {
			description: '<p onclick="x()">Bonjour</p>\n<script>alert(1)</script><b>toutes</b>',
		})

		expect(result).toEqual({ ok: true, valeurs: { description: 'Bonjour\ntoutes' } })
		expect((await storedProfile(payload, a)).description).toBe('Bonjour\ntoutes')
	})
})

describe('U32, I02 : une requête forgée est refusée, rien ne change', () => {
	test.each([
		['status', 'published'],
		['verifie', true],
		['score', 99],
		['pro', 1],
		['slug', 'pirate'],
		['id', 1],
		['prenom', 'Pirate'],
	])('la clé %s refuse la requête entière', async (cle, valeur) => {
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const before = await storedProfile(payload, a)

		const result = await saveDescription(payload, await userOf(payload, a), {
			description: 'Texte',
			[cle]: valeur,
		})

		expect(result).toEqual({ ok: false, message: FAILURE_MESSAGE })
		const after = await storedProfile(payload, a)
		expect(after.updatedAt).toBe(before.updatedAt)
		expect(after.description).toBe(before.description)
	})

	test('un compte sans profil ne crée rien : message du site', async () => {
		const withoutProfile = await createAccount('maquilleuse-sans-profil')
		const payload = await testPayload()
		const doc = await payload.findByID({ collection: 'pros', id: withoutProfile.id, depth: 0, overrideAccess: true })
		const result = await saveDescription(payload, { ...doc, collection: 'pros' } as DashboardUser, {
			description: 'Texte',
		})
		expect(result).toEqual({ ok: false, message: FAILURE_MESSAGE })
		expect((await payload.count({ collection: 'profiles', overrideAccess: true })).totalDocs).toBe(0)
	})
})

describe('U05 : la longueur enregistrée rend le profil publiable par la définition unique', () => {
	test('199 caractères : pas de condition remplie ; 200 : la condition « description » l’est', async () => {
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const user = await userOf(payload, a)
		const { publishableConditions } = await import('@/lib/profile/completeness')
		const { profileFields } = await import('@/lib/profile/state')

		await saveDescription(payload, user, { description: 'a'.repeat(199) })
		expect(publishableConditions(profileFields(await storedProfile(payload, a))).descriptionLongue).toBe(false)

		await saveDescription(payload, user, { description: 'a'.repeat(200) })
		expect(publishableConditions(profileFields(await storedProfile(payload, a))).descriptionLongue).toBe(true)
	})
})
