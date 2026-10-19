import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { enregistrerDescription } from '@/lib/espace/enregistrer-description'
import type { UtilisateurDeLEspace } from '@/lib/espace/mon-profil'
import { MESSAGE_ECHEC } from '@/lib/espace/resultat'
import { type CompteDeTest, creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'

/**
 * The description saved from her space (ticket 122; plan 02 E19-E29 description, U27, U32, I02): the
 * text is stored with its line breaks, the HTML is removed, 2 001 characters are refused, and the
 * value given back is the one the database holds.
 */

afterEach(viderLaBase)

type Maquilleuse = CompteDeTest<'maquilleuse'>

async function utilisateurDe(payload: Payload, compte: Maquilleuse): Promise<UtilisateurDeLEspace> {
	const doc = await payload.findByID({ collection: 'pros', id: compte.id, depth: 0, overrideAccess: true })
	return { ...doc, collection: 'pros' } as UtilisateurDeLEspace
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

describe('E19-E29 : la description enregistrée est celle de la base', () => {
	test('le texte est stocké avec ses sauts de ligne, rendu tel que stocké, le profil de B ne bouge pas', async () => {
		const a = await creerCompte('maquilleuse')
		const b = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const avantB = await profilStocke(payload, b)

		const resultat = await enregistrerDescription(payload, await utilisateurDe(payload, a), {
			description: '  Maquilleuse mariée.\r\n\r\nJe me déplace dans toute la région.  ',
		})

		const attendu = 'Maquilleuse mariée.\n\nJe me déplace dans toute la région.'
		expect(resultat).toEqual({ ok: true, valeurs: { description: attendu } })
		expect((await profilStocke(payload, a)).description).toBe(attendu)
		expect((await profilStocke(payload, b)).description).toBe(avantB.description)
	})

	test('une description vide efface le texte', async () => {
		const a = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const utilisateur = await utilisateurDe(payload, a)
		await enregistrerDescription(payload, utilisateur, { description: 'Un texte' })

		const resultat = await enregistrerDescription(payload, utilisateur, { description: '   ' })

		expect(resultat).toEqual({ ok: true, valeurs: { description: '' } })
		expect((await profilStocke(payload, a)).description ?? '').toBe('')
	})
})

describe('U27 : 2 000 caractères au plus, HTML retiré', () => {
	test('2 000 sont stockés, 2 001 sont refusés et l’ancien texte reste', async () => {
		const a = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const utilisateur = await utilisateurDe(payload, a)

		const bon = await enregistrerDescription(payload, utilisateur, { description: 'a'.repeat(2000) })
		expect(bon.ok).toBe(true)
		const avant = await profilStocke(payload, a)

		const refus = await enregistrerDescription(payload, utilisateur, { description: 'b'.repeat(2001) })
		expect(refus).toMatchObject({
			ok: false,
			champs: { description: 'Ta description ne doit pas dépasser 2000 caractères.' },
		})
		const apres = await profilStocke(payload, a)
		expect(apres.description).toBe('a'.repeat(2000))
		expect(apres.updatedAt).toBe(avant.updatedAt)
	})

	test('le HTML collé est retiré avant d’être stocké', async () => {
		const a = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()

		const resultat = await enregistrerDescription(payload, await utilisateurDe(payload, a), {
			description: '<p onclick="x()">Bonjour</p>\n<script>alert(1)</script><b>toutes</b>',
		})

		expect(resultat).toEqual({ ok: true, valeurs: { description: 'Bonjour\ntoutes' } })
		expect((await profilStocke(payload, a)).description).toBe('Bonjour\ntoutes')
	})
})

describe('U32, I02 : une requête forgée est refusée, rien ne change', () => {
	test.each([
		['statut', 'publie'],
		['verifie', true],
		['score', 99],
		['pro', 1],
		['slug', 'pirate'],
		['id', 1],
		['prenom', 'Pirate'],
	])('la clé %s refuse la requête entière', async (cle, valeur) => {
		const a = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const avant = await profilStocke(payload, a)

		const resultat = await enregistrerDescription(payload, await utilisateurDe(payload, a), {
			description: 'Texte',
			[cle]: valeur,
		})

		expect(resultat).toEqual({ ok: false, message: MESSAGE_ECHEC })
		const apres = await profilStocke(payload, a)
		expect(apres.updatedAt).toBe(avant.updatedAt)
		expect(apres.description).toBe(avant.description)
	})

	test('un compte sans profil ne crée rien : message du site', async () => {
		const sansProfil = await creerCompte('maquilleuse-sans-profil')
		const payload = await payloadDeTest()
		const doc = await payload.findByID({ collection: 'pros', id: sansProfil.id, depth: 0, overrideAccess: true })
		const resultat = await enregistrerDescription(payload, { ...doc, collection: 'pros' } as UtilisateurDeLEspace, {
			description: 'Texte',
		})
		expect(resultat).toEqual({ ok: false, message: MESSAGE_ECHEC })
		expect((await payload.count({ collection: 'profiles', overrideAccess: true })).totalDocs).toBe(0)
	})
})

describe('U05 : la longueur enregistrée rend le profil publiable par la définition unique', () => {
	test('199 caractères : pas de condition remplie ; 200 : la condition « description » l’est', async () => {
		const a = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const utilisateur = await utilisateurDe(payload, a)
		const { conditionsPubliable } = await import('@/lib/profil/completude')

		await enregistrerDescription(payload, utilisateur, { description: 'a'.repeat(199) })
		expect(conditionsPubliable(await profilStocke(payload, a)).descriptionLongue).toBe(false)

		await enregistrerDescription(payload, utilisateur, { description: 'a'.repeat(200) })
		expect(conditionsPubliable(await profilStocke(payload, a)).descriptionLongue).toBe(true)
	})
})
