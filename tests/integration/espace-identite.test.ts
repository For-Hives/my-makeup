import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { enregistrerIdentite } from '@/lib/espace/enregistrer-identite'
import { profilDeLaMaquilleuse, type UtilisateurDeLEspace } from '@/lib/espace/mon-profil'
import { MESSAGE_ECHEC } from '@/lib/espace/resultat'
import { type CompteDeTest, creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'

/**
 * The identity saved from her space (tickets 118 and 119; plan 02 U54, I02, I03, I19, U32): the
 * profile read and written is hers alone, the reserved fields are refused, the slug stays, and the
 * values given back are the ones the database holds.
 */

afterEach(viderLaBase)

type Maquilleuse = CompteDeTest<'maquilleuse'>

/** The account as Payload hands it to a request: what the access rules read. */
async function utilisateurDe(payload: Payload, compte: Maquilleuse): Promise<UtilisateurDeLEspace> {
	const doc = await payload.findByID({ collection: 'pros', id: compte.id, depth: 0, overrideAccess: true })
	return { ...doc, collection: 'pros' } as UtilisateurDeLEspace
}

async function profilStocke(payload: Payload, compte: Maquilleuse) {
	const { docs } = await payload.find({
		collection: 'profils',
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
		const a = await creerCompte('maquilleuse')
		const b = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		await payload.update({ collection: 'profils', id: (await profilStocke(payload, b)).id, data: IDENTITE })

		const profilDeA = await profilDeLaMaquilleuse(payload, await utilisateurDe(payload, a))

		expect(profilDeA?.id).toBe((await profilStocke(payload, a)).id)
		expect(profilDeA?.nom).not.toBe('Fictive')
		expect(JSON.stringify(profilDeA)).not.toContain('Studio Fictif')
		// Nothing the cards do not show: no account, no internal field, no slug.
		expect(Object.keys(profilDeA ?? {}).sort()).not.toContain('pro')
		expect(profilDeA).not.toHaveProperty('noteInterne')
		expect(profilDeA).not.toHaveProperty('score')
	})

	test('un compte de l’administration n’a pas de profil de maquilleuse', async () => {
		const admin = await creerCompte('admin')
		const payload = await payloadDeTest()
		const doc = await payload.findByID({ collection: 'admins', id: admin.id, depth: 0, overrideAccess: true })
		const utilisateur = { ...doc, collection: 'admins' } as unknown as UtilisateurDeLEspace
		expect(await profilDeLaMaquilleuse(payload, utilisateur)).toBeNull()
	})
})

describe('E19 : l’identité enregistrée est celle de la base', () => {
	test('les valeurs rendues sont les valeurs stockées, rognées, et le profil de A seul a changé', async () => {
		const a = await creerCompte('maquilleuse')
		const b = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const avantB = await profilStocke(payload, b)

		const resultat = await enregistrerIdentite(payload, await utilisateurDe(payload, a), {
			...IDENTITE,
			prenom: '  Léa  ',
		})

		expect(resultat).toEqual({ ok: true, valeurs: IDENTITE })
		expect(await profilStocke(payload, a)).toMatchObject(IDENTITE)
		expect(await profilStocke(payload, b)).toMatchObject({ prenom: avantB.prenom, nom: avantB.nom })
	})
})

describe('U32, I03, I02 : une requête forgée est refusée, rien ne change', () => {
	test.each([
		['statut', 'publie'],
		['verifie', true],
		['score', 99],
		['pro', 1],
		['slug', 'pirate'],
		['id', 1],
		['superMaquilleuse', true],
	])('la clé réservée %s refuse la requête entière', async (cle, valeur) => {
		const a = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const avant = await profilStocke(payload, a)

		const resultat = await enregistrerIdentite(payload, await utilisateurDe(payload, a), {
			...IDENTITE,
			[cle]: valeur,
		})

		expect(resultat).toEqual({ ok: false, message: MESSAGE_ECHEC })
		const apres = await profilStocke(payload, a)
		expect(apres.updatedAt).toBe(avant.updatedAt)
		expect(apres.prenom).toBe(avant.prenom)
		expect(apres.slug).toBe(avant.slug)
		expect(apres.statut).toBe(avant.statut)
		expect(apres.verifie).toBe(avant.verifie)
	})

	test('hors bornes : le message est sous le champ et la base ne bouge pas', async () => {
		const a = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const avant = await profilStocke(payload, a)

		const resultat = await enregistrerIdentite(payload, await utilisateurDe(payload, a), {
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
		const sansProfil = await creerCompte('maquilleuse-sans-profil')
		const payload = await payloadDeTest()
		const doc = await payload.findByID({ collection: 'pros', id: sansProfil.id, depth: 0, overrideAccess: true })
		const resultat = await enregistrerIdentite(
			payload,
			{ ...doc, collection: 'pros' } as UtilisateurDeLEspace,
			IDENTITE
		)
		expect(resultat).toEqual({ ok: false, message: MESSAGE_ECHEC })
		expect((await payload.count({ collection: 'profils', overrideAccess: true })).totalDocs).toBe(0)
	})
})

describe('I19 : changer de nom ne change pas l’adresse du profil', () => {
	test('deux enregistrements de suite, le slug est celui de la création', async () => {
		const a = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const utilisateur = await utilisateurDe(payload, a)
		const slug = (await profilStocke(payload, a)).slug

		await Promise.all([
			enregistrerIdentite(payload, utilisateur, IDENTITE),
			enregistrerIdentite(payload, utilisateur, { ...IDENTITE, nom: 'Autre', prenom: 'Zoé' }),
		])

		const apres = await profilStocke(payload, a)
		expect(apres.slug).toBe(slug)
		expect(['Fictive', 'Autre']).toContain(apres.nom ?? '')
	})
})
