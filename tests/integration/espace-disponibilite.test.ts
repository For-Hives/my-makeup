import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { enregistrerDisponibilite } from '@/lib/dashboard/save-availability'
import type { UtilisateurDeLEspace } from '@/lib/dashboard/my-profile'
import { MESSAGE_ECHEC } from '@/lib/dashboard/result'
import { FILTRE_LISTE } from '@/lib/profil/visibilite'
import { type CompteDeTest, creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'

/**
 * The availability saved from her space (ticket 124; plan 02 E19-E29, U32, I02): hers alone, the
 * value given back is the stored one, a forged request changes nothing, and a profile with no
 * value stored (imported) is read as available.
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

describe('E19-E29 : la disponibilité enregistrée est celle de la base', () => {
	test('indisponible, puis disponible : la valeur rendue est la valeur stockée, le profil de B ne bouge pas', async () => {
		const a = await creerCompte('maquilleuse')
		const b = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const utilisateur = await utilisateurDe(payload, a)
		const avantB = await profilStocke(payload, b)
		const slug = (await profilStocke(payload, a)).slug

		expect(await enregistrerDisponibilite(payload, utilisateur, { disponible: false })).toEqual({
			ok: true,
			valeurs: { disponible: false },
		})
		expect((await profilStocke(payload, a)).available).toBe(false)

		expect(await enregistrerDisponibilite(payload, utilisateur, { disponible: true })).toEqual({
			ok: true,
			valeurs: { disponible: true },
		})
		const apres = await profilStocke(payload, a)
		expect(apres.available).toBe(true)
		expect(apres.slug).toBe(slug)
		const apresB = await profilStocke(payload, b)
		expect(apresB.available).toBe(avantB.available)
		expect(apresB.updatedAt).toBe(avantB.updatedAt)
	})

	test('une valeur nulle importée est rendue « disponible » après une écriture qui ne la touche pas', async () => {
		const a = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const profil = await profilStocke(payload, a)
		await payload.db.updateOne({ collection: 'profiles', id: profil.id, data: { available: null }, returning: false })
		expect((await profilStocke(payload, a)).available ?? null).toBeNull()

		const resultat = await enregistrerDisponibilite(payload, await utilisateurDe(payload, a), { disponible: true })
		expect(resultat).toEqual({ ok: true, valeurs: { disponible: true } })
	})
})

describe('E19-E29 : indisponible, le profil sort de la liste publique', () => {
	test('la liste le montre disponible, ne le montre plus indisponible, le montre de nouveau disponible', async () => {
		const a = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const utilisateur = await utilisateurDe(payload, a)
		const id = (await profilStocke(payload, a)).id
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
		const listee = async () =>
			(
				await payload.find({
					collection: 'profiles',
					depth: 0,
					limit: 1,
					overrideAccess: false,
					select: {},
					where: { and: [{ id: { equals: id } }, FILTRE_LISTE] },
				})
			).totalDocs === 1

		expect(await listee()).toBe(true)
		await enregistrerDisponibilite(payload, utilisateur, { disponible: false })
		expect(await listee()).toBe(false)
		await enregistrerDisponibilite(payload, utilisateur, { disponible: true })
		expect(await listee()).toBe(true)
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
		const a = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const avant = await profilStocke(payload, a)

		const resultat = await enregistrerDisponibilite(payload, await utilisateurDe(payload, a), saisie)

		expect(resultat).toEqual({ ok: false, message: MESSAGE_ECHEC })
		const apres = await profilStocke(payload, a)
		expect(apres.updatedAt).toBe(avant.updatedAt)
		expect(apres.available).toBe(avant.available)
	})

	test('un compte sans profil ne crée rien', async () => {
		const sansProfil = await creerCompte('maquilleuse-sans-profil')
		const payload = await payloadDeTest()
		const doc = await payload.findByID({ collection: 'pros', id: sansProfil.id, depth: 0, overrideAccess: true })
		const resultat = await enregistrerDisponibilite(payload, { ...doc, collection: 'pros' } as UtilisateurDeLEspace, {
			disponible: false,
		})
		expect(resultat).toEqual({ ok: false, message: MESSAGE_ECHEC })
		expect((await payload.count({ collection: 'profiles', overrideAccess: true })).totalDocs).toBe(0)
	})
})
