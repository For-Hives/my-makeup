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

type Maquilleuse = TestAccount<'maquilleuse'>

/** The account as Payload hands it to a request: what the access rules read. */
async function utilisateurDe(payload: Payload, compte: Maquilleuse): Promise<DashboardUser> {
	const doc = await payload.findByID({ collection: 'pros', id: compte.id, depth: 0, overrideAccess: true })
	return { ...doc, collection: 'pros' } as DashboardUser
}

async function profilStocke(payload: Payload, compte: Maquilleuse) {
	const { docs } = await payload.find({
		collection: 'profiles',
		depth: 0,
		overrideAccess: true,
		where: { pro: { equals: compte.id } },
	})
	const profil = docs[0]
	if (!profil) throw new Error('pas de profil')
	return profil
}

const IDENTITE = { prenom: 'Léa', nom: 'Fictive', nomArtiste: 'Studio Fictif', specialite: 'Maquillage mariée' }

describe('U54 : la page ne lit que le profil de la maquilleuse connectée', () => {
	test('A lit le sien, jamais celui de B', async () => {
		const a = await createAccount('maquilleuse')
		const b = await createAccount('maquilleuse')
		const payload = await testPayload()
		await payload.update({
			collection: 'profiles',
			id: (await profilStocke(payload, b)).id,
			data: {
				firstName: IDENTITE.prenom,
				lastName: IDENTITE.nom,
				artistName: IDENTITE.nomArtiste,
				specialty: IDENTITE.specialite,
			},
		})

		const profilDeA = await artistProfile(payload, await utilisateurDe(payload, a))

		expect(profilDeA?.id).toBe((await profilStocke(payload, a)).id)
		expect(profilDeA?.lastName).not.toBe('Fictive')
		expect(JSON.stringify(profilDeA)).not.toContain('Studio Fictif')
		// Nothing the cards do not show: no account, no internal field, no slug.
		expect(Object.keys(profilDeA ?? {}).sort()).not.toContain('pro')
		expect(profilDeA).not.toHaveProperty('internalNote')
		expect(profilDeA).not.toHaveProperty('score')
	})

	test('un compte de l’administration n’a pas de profil de maquilleuse', async () => {
		const admin = await createAccount('admin')
		const payload = await testPayload()
		const doc = await payload.findByID({ collection: 'admins', id: admin.id, depth: 0, overrideAccess: true })
		const utilisateur = { ...doc, collection: 'admins' } as unknown as DashboardUser
		expect(await artistProfile(payload, utilisateur)).toBeNull()
	})
})

describe('E19 : l’identité enregistrée est celle de la base', () => {
	test('les valeurs rendues sont les valeurs stockées, rognées, et le profil de A seul a changé', async () => {
		const a = await createAccount('maquilleuse')
		const b = await createAccount('maquilleuse')
		const payload = await testPayload()
		const avantB = await profilStocke(payload, b)

		const resultat = await saveIdentity(payload, await utilisateurDe(payload, a), {
			...IDENTITE,
			prenom: '  Léa  ',
		})

		expect(resultat).toEqual({ ok: true, valeurs: IDENTITE })
		expect(await profilStocke(payload, a)).toMatchObject({
			firstName: 'Léa',
			lastName: 'Fictive',
			artistName: 'Studio Fictif',
			specialty: 'Maquillage mariée',
		})
		expect(await profilStocke(payload, b)).toMatchObject({ firstName: avantB.firstName, lastName: avantB.lastName })
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
		const avant = await profilStocke(payload, a)

		const resultat = await saveIdentity(payload, await utilisateurDe(payload, a), {
			...IDENTITE,
			[cle]: valeur,
		})

		expect(resultat).toEqual({ ok: false, message: FAILURE_MESSAGE })
		const apres = await profilStocke(payload, a)
		expect(apres.updatedAt).toBe(avant.updatedAt)
		expect(apres.firstName).toBe(avant.firstName)
		expect(apres.slug).toBe(avant.slug)
		expect(apres.status).toBe(avant.status)
		expect(apres.verified).toBe(avant.verified)
	})

	test('hors bornes : le message est sous le champ et la base ne bouge pas', async () => {
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const avant = await profilStocke(payload, a)

		const resultat = await saveIdentity(payload, await utilisateurDe(payload, a), {
			...IDENTITE,
			nom: 'A',
			specialite: 'x'.repeat(71),
		})

		expect(resultat).toMatchObject({
			ok: false,
			champs: {
				nom: 'Ton nom doit contenir au moins 2 caractères.',
				specialite: 'Ta spécialité ne doit pas dépasser 70 caractères.',
			},
		})
		expect((await profilStocke(payload, a)).updatedAt).toBe(avant.updatedAt)
	})

	test('un compte sans profil ne crée rien : message du site', async () => {
		const sansProfil = await createAccount('maquilleuse-sans-profil')
		const payload = await testPayload()
		const doc = await payload.findByID({ collection: 'pros', id: sansProfil.id, depth: 0, overrideAccess: true })
		const resultat = await saveIdentity(payload, { ...doc, collection: 'pros' } as DashboardUser, IDENTITE)
		expect(resultat).toEqual({ ok: false, message: FAILURE_MESSAGE })
		expect((await payload.count({ collection: 'profiles', overrideAccess: true })).totalDocs).toBe(0)
	})
})

describe('I19 : changer de nom ne change pas l’adresse du profil', () => {
	test('deux enregistrements de suite, le slug est celui de la création', async () => {
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const utilisateur = await utilisateurDe(payload, a)
		const slug = (await profilStocke(payload, a)).slug

		await Promise.all([
			saveIdentity(payload, utilisateur, IDENTITE),
			saveIdentity(payload, utilisateur, { ...IDENTITE, nom: 'Autre', prenom: 'Zoé' }),
		])

		const apres = await profilStocke(payload, a)
		expect(apres.slug).toBe(slug)
		expect(['Fictive', 'Autre']).toContain(apres.lastName ?? '')
	})
})
