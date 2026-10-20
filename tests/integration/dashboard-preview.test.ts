import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { type DashboardUser, profileId } from '@/lib/dashboard/my-profile'
import { readProfilePreview, readProfileUrlTarget } from '@/services/public/profiles'
import { createAccount, type TestAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'

/**
 * The preview of her own page (ticket 139; plan 02 RG-06): the same content as the public page for a
 * complete profile, the profile found by her account and no one else's, a draft and a hidden profile
 * still previewed, and the contact details only when she published them.
 */

afterEach(emptyBase)

type Artist = TestAccount<'maquilleuse'>

async function sheetOf(payload: Payload, compte: Artist) {
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } })
	const [sheet] = docs
	if (!sheet) throw new Error('pas de profil')
	return sheet
}

async function userOf(payload: Payload, compte: Artist): Promise<DashboardUser> {
	const doc = await payload.findByID({ collection: 'pros', id: compte.id, depth: 0, overrideAccess: true })
	return { ...doc, collection: 'pros' } as DashboardUser
}

const FULL = {
	firstName: 'Léa',
	lastName: 'Fictive',
	specialty: 'Maquillage mariée',
	description: 'Je maquille pour les mariages.\nDeuxième ligne.',
	skills: [{ name: 'Teint', description: 'Un teint lumineux' }],
	languages: [{ name: 'Français' }],
	networks: { instagram: 'https://www.instagram.com/lea.fictive' },
	contactDetails: { phone: '06 39 98 00 01', email: 'lea@example.test' },
	publicContact: true,
}

describe('139 : l’aperçu est la page publique', () => {
	test('profil complet : exactement le même profil que la lecture de l’adresse publique', async () => {
		const account = await createAccount('maquilleuse')
		const payload = await testPayload()
		const sheet = await sheetOf(payload, account)
		await payload.update({ collection: 'profiles', id: sheet.id, data: FULL })
		const slug = (await sheetOf(payload, account)).slug

		const preview = await readProfilePreview(payload, sheet.id)
		const url = await readProfileUrlTarget(payload, slug)
		expect(url.type).toBe('profil')
		if (url.type !== 'profil') return
		expect(preview?.profil).toEqual(url.profil)
		expect(preview?.profil.coordonnees).toEqual({ telephone: '06 39 98 00 01', email: 'lea@example.test' })
	})

	test('coordonnées non publiées : ni téléphone ni email dans l’aperçu, comme dans la page publique', async () => {
		const account = await createAccount('maquilleuse')
		const payload = await testPayload()
		const sheet = await sheetOf(payload, account)
		await payload.update({ collection: 'profiles', id: sheet.id, data: { ...FULL, publicContact: false } })
		const preview = await readProfilePreview(payload, sheet.id)
		expect(preview?.profil.coordonnees).toBeNull()
		expect(JSON.stringify(preview?.profil)).not.toMatch(/example\.test|06 39 98/)
	})

	test('profil vide (brouillon) : aperçu possible, état dit vide ; profil masqué : aperçu possible, état masqué', async () => {
		const account = await createAccount('maquilleuse')
		const payload = await testPayload()
		const sheet = await sheetOf(payload, account)
		const empty = await readProfilePreview(payload, sheet.id)
		expect(empty?.etat).toMatchObject({ status: 'draft', fullyEmpty: true })

		await payload.update({ collection: 'profiles', id: sheet.id, data: FULL })
		await payload.update({
			collection: 'profiles',
			id: sheet.id,
			data: { chosenStatus: 'hidden', reason: 'Masqué pour le test' },
		})
		const slug = (await sheetOf(payload, account)).slug
		expect((await readProfileUrlTarget(payload, slug)).type).toBe('inconnue')
		const hidden = await readProfilePreview(payload, sheet.id)
		expect(hidden?.etat.status).toBe('hidden')
		expect(hidden?.profil.nom).toBe('Léa Fictive')
	})

	test('un identifiant inconnu ne donne rien', async () => {
		const payload = await testPayload()
		expect(await readProfilePreview(payload, 987_654)).toBeNull()
	})
})

describe('139 : seulement le sien', () => {
	test('l’identifiant vient de la session : A obtient son profil, B le sien, jamais l’autre', async () => {
		const a = await createAccount('maquilleuse')
		const b = await createAccount('maquilleuse')
		const payload = await testPayload()
		const sheetA = await sheetOf(payload, a)
		const sheetB = await sheetOf(payload, b)
		await payload.update({ collection: 'profiles', id: sheetB.id, data: { firstName: 'Bea', lastName: 'Autre' } })

		const idA = await profileId(payload, await userOf(payload, a))
		const idB = await profileId(payload, await userOf(payload, b))
		expect(idA).toBe(sheetA.id)
		expect(idB).toBe(sheetB.id)
		expect((await readProfilePreview(payload, idA ?? -1))?.profil.nom).not.toContain('Bea')
		expect((await readProfilePreview(payload, idB ?? -1))?.profil.nom).toBe('Bea Autre')
	})

	test('un compte sans profil n’a pas d’aperçu', async () => {
		const account = await createAccount('maquilleuse-sans-profil')
		const payload = await testPayload()
		expect(await profileId(payload, await userOf(payload, account as unknown as Artist))).toBeNull()
	})
})
