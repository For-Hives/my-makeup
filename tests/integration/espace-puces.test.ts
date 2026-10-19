import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { enregistrerCompetences, enregistrerLangues } from '@/lib/espace/enregistrer-puces'
import { profilDeLaMaquilleuse, type UtilisateurDeLEspace } from '@/lib/espace/mon-profil'
import { COMPETENCES, LANGUES, pucesDeLaListe } from '@/lib/espace/puces'
import { MESSAGE_ECHEC } from '@/lib/espace/resultat'
import { type CompteDeTest, creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'

/**
 * The languages and the skills saved from her space (tickets 127 and 128; plan 02 E30, E31, I02):
 * the order and the identifiers of the chips are stored, two chips of the same name are two rows,
 * a made-up identifier is not kept, a name beyond 70 characters is refused and writes nothing, and
 * the description of a skill, which the chips do not show, survives a save. Made-up values only.
 */

afterEach(viderLaBase)

type Maquilleuse = CompteDeTest<'maquilleuse'>

async function utilisateurDe(payload: Payload, compte: Maquilleuse): Promise<UtilisateurDeLEspace> {
	const doc = await payload.findByID({ collection: 'pros', id: compte.id, depth: 0, overrideAccess: true })
	return { ...doc, collection: 'pros' } as UtilisateurDeLEspace
}

async function profilStocke(payload: Payload, compte: { id: number | string }) {
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

async function maquilleuse() {
	const compte = await creerCompte('maquilleuse')
	const payload = await payloadDeTest()
	return { compte, payload, utilisateur: await utilisateurDe(payload, compte) }
}

const puces = (resultat: { ok: boolean; valeurs?: { puces: readonly { id: string; nom: string }[] } }) =>
	resultat.valeurs?.puces ?? []

describe('127 : les langues', () => {
	test('la liste et son ordre sont stockés, chaque puce a son identifiant, et c’est ce que la base rend', async () => {
		const { payload, utilisateur, compte } = await maquilleuse()

		const resultat = await enregistrerLangues(payload, utilisateur, {
			puces: [{ nom: ' Français ' }, { nom: 'Anglais' }, { nom: 'Espagnol' }],
		})

		expect(resultat.ok).toBe(true)
		expect(puces(resultat).map(({ nom }) => nom)).toEqual(['Français', 'Anglais', 'Espagnol'])
		expect(new Set(puces(resultat).map(({ id }) => id)).size).toBe(3)
		const stockees = (await profilStocke(payload, compte)).languages ?? []
		expect(stockees.map(({ name }) => name)).toEqual(['Français', 'Anglais', 'Espagnol'])
		expect(stockees.map(({ id }) => id)).toEqual(puces(resultat).map(({ id }) => id))
	})

	test('L1 : deux puces de même nom déjà stockées : retirer l’une laisse l’autre, et son identifiant ne change pas', async () => {
		const { payload, utilisateur, compte } = await maquilleuse()
		const profil = await profilStocke(payload, compte)
		await payload.update({
			collection: 'profiles',
			id: profil.id,
			data: { languages: [{ name: 'Anglais' }, { name: 'Anglais' }, { name: 'Russe' }] },
		})
		const avant = (await profilStocke(payload, compte)).languages ?? []
		expect(new Set(avant.map(({ id }) => id)).size).toBe(3)

		const resultat = await enregistrerLangues(payload, utilisateur, {
			puces: avant.filter((_, rang) => rang !== 0).map(({ id, name }) => ({ id, nom: name })),
		})

		expect(resultat.ok).toBe(true)
		expect(puces(resultat)).toEqual([
			{ id: avant[1]?.id as string, nom: 'Anglais' },
			{ id: avant[2]?.id as string, nom: 'Russe' },
		])
	})

	test('une liste enregistrée avec ses doublons d’avant reste enregistrable, sans les perdre', async () => {
		const { payload, utilisateur, compte } = await maquilleuse()
		const profil = await profilStocke(payload, compte)
		await payload.update({
			collection: 'profiles',
			id: profil.id,
			data: { languages: [{ name: 'Anglais' }, { name: 'anglais' }] },
		})
		const avant = (await profilStocke(payload, compte)).languages ?? []

		const resultat = await enregistrerLangues(payload, utilisateur, {
			puces: [...avant.map(({ id, name }) => ({ id, nom: name })), { nom: 'Russe' }],
		})

		expect(resultat.ok).toBe(true)
		expect(puces(resultat).map(({ nom }) => nom)).toEqual(['Anglais', 'anglais', 'Russe'])
	})

	test('un identifiant inventé, ou pris dans le profil d’une autre, n’est pas gardé : la puce est neuve', async () => {
		const { payload, utilisateur } = await maquilleuse()
		const autre = await maquilleuse()
		const profilAutre = await profilStocke(payload, autre.compte)
		await payload.update({ collection: 'profiles', id: profilAutre.id, data: { languages: [{ name: 'Basque' }] } })
		const idAutre = ((await profilStocke(payload, autre.compte)).languages ?? [])[0]?.id as string

		const resultat = await enregistrerLangues(payload, utilisateur, {
			puces: [
				{ id: idAutre, nom: 'Anglais' },
				{ id: 'inventé', nom: 'Russe' },
			],
		})

		expect(resultat.ok).toBe(true)
		expect(puces(resultat).map(({ id }) => id)).not.toContain(idAutre)
		expect(puces(resultat).map(({ id }) => id)).not.toContain('inventé')
		expect(((await profilStocke(payload, autre.compte)).languages ?? []).map(({ name }) => name)).toEqual(['Basque'])
	})

	test('E30 : un nom de 71 caractères est refusé en français, et rien n’est écrit', async () => {
		const { payload, utilisateur, compte } = await maquilleuse()
		await enregistrerLangues(payload, utilisateur, { puces: [{ nom: 'Anglais' }] })

		const resultat = await enregistrerLangues(payload, utilisateur, {
			puces: [{ nom: 'Anglais' }, { nom: 'x'.repeat(71) }],
		})

		expect(resultat).toEqual({ ok: false, message: LANGUES.tropLong })
		expect(((await profilStocke(payload, compte)).languages ?? []).map(({ name }) => name)).toEqual(['Anglais'])
		const limite = await enregistrerLangues(payload, utilisateur, { puces: [{ nom: 'é'.repeat(70) }] })
		expect(limite.ok).toBe(true)
	})

	test('un nom vide est refusé, et une puce neuve qui double une autre aussi', async () => {
		const { payload, utilisateur } = await maquilleuse()
		expect(await enregistrerLangues(payload, utilisateur, { puces: [{ nom: '  ' }] })).toEqual({
			ok: false,
			message: LANGUES.requis,
		})
		expect(
			await enregistrerLangues(payload, utilisateur, { puces: [{ nom: 'Anglais' }, { nom: ' anglais' }] })
		).toEqual({
			ok: false,
			message: LANGUES.doublon,
		})
	})

	test('une demande qui porte autre chose que des puces est refusée en entier', async () => {
		const { payload, utilisateur, compte } = await maquilleuse()
		for (const saisie of [
			{ puces: [], pro: 1 },
			{ puces: [{ nom: 'a', description: 'b' }] },
			{ id: 1, puces: [] },
			null,
		]) {
			expect(await enregistrerLangues(payload, utilisateur, saisie)).toEqual({ ok: false, message: LANGUES.invalide })
		}
		expect((await profilStocke(payload, compte)).languages ?? []).toEqual([])
	})

	test('I02 : elle n’écrit que dans son profil, trouvé par son compte', async () => {
		const { payload, utilisateur } = await maquilleuse()
		const autre = await maquilleuse()
		await enregistrerLangues(payload, utilisateur, { puces: [{ nom: 'Anglais' }] })
		expect((await profilStocke(payload, autre.compte)).languages ?? []).toEqual([])
	})

	test('un compte sans profil ne crée rien : message du site', async () => {
		const payload = await payloadDeTest()
		const sansProfil = await creerCompte('maquilleuse-sans-profil')
		const doc = await payload.findByID({ collection: 'pros', id: sansProfil.id, depth: 0, overrideAccess: true })
		const utilisateur = { ...doc, collection: 'pros' } as UtilisateurDeLEspace

		expect(await enregistrerLangues(payload, utilisateur, { puces: [{ nom: 'Anglais' }] })).toEqual({
			ok: false,
			message: MESSAGE_ECHEC,
		})
		const { totalDocs } = await payload.count({ collection: 'profiles', overrideAccess: true })
		expect(totalDocs).toBe(0)
	})

	test('E31 : l’échec de la base donne le message du site, et la liste d’avant reste', async () => {
		const { payload, utilisateur, compte } = await maquilleuse()
		await enregistrerLangues(payload, utilisateur, { puces: [{ nom: 'Anglais' }] })
		const casse = Object.create(payload, {
			update: {
				value: async () => {
					throw new Error('connexion perdue')
				},
			},
		}) as Payload

		expect(await enregistrerLangues(casse, utilisateur, { puces: [{ nom: 'Russe' }] })).toEqual({
			ok: false,
			message: MESSAGE_ECHEC,
		})
		expect(((await profilStocke(payload, compte)).languages ?? []).map(({ name }) => name)).toEqual(['Anglais'])
	})

	test('la page de son espace lit ce qui a été stocké, dans l’ordre', async () => {
		const { payload, utilisateur } = await maquilleuse()
		await enregistrerLangues(payload, utilisateur, { puces: [{ nom: 'Russe' }, { nom: 'Anglais' }] })
		const profil = await profilDeLaMaquilleuse(payload, utilisateur)
		expect(pucesDeLaListe(profil?.languages).map(({ nom }) => nom)).toEqual(['Russe', 'Anglais'])
	})
})

describe('128 : les compétences', () => {
	test('la liste et son ordre sont stockés', async () => {
		const { payload, utilisateur, compte } = await maquilleuse()

		const resultat = await enregistrerCompetences(payload, utilisateur, {
			puces: [{ nom: 'Teint' }, { nom: 'Yeux' }],
		})

		expect(resultat.ok).toBe(true)
		const stockees = (await profilStocke(payload, compte)).skills ?? []
		expect(stockees.map(({ name }) => name)).toEqual(['Teint', 'Yeux'])
		expect(stockees.map(({ id }) => id)).toEqual(puces(resultat).map(({ id }) => id))
	})

	test('la description d’une compétence, que les puces ne montrent pas, survit à l’enregistrement', async () => {
		const { payload, utilisateur, compte } = await maquilleuse()
		const profil = await profilStocke(payload, compte)
		await payload.update({
			collection: 'profiles',
			id: profil.id,
			data: { skills: [{ name: 'Teint', description: 'Peaux mates et matures.' }, { name: 'Yeux' }] },
		})
		const avant = (await profilStocke(payload, compte)).skills ?? []

		await enregistrerCompetences(payload, utilisateur, {
			puces: [...avant.map(({ id, name }) => ({ id, nom: name })), { nom: 'Ongles' }],
		})

		const apres = (await profilStocke(payload, compte)).skills ?? []
		expect(apres.map(({ name, description }) => [name, description ?? null])).toEqual([
			['Teint', 'Peaux mates et matures.'],
			['Yeux', null],
			['Ongles', null],
		])
	})

	test('E30 : un nom de 71 caractères est refusé, et la langue du même nom ne gêne pas', async () => {
		const { payload, utilisateur, compte } = await maquilleuse()
		await enregistrerLangues(payload, utilisateur, { puces: [{ nom: 'Teint' }] })

		expect(await enregistrerCompetences(payload, utilisateur, { puces: [{ nom: 'x'.repeat(71) }] })).toEqual({
			ok: false,
			message: COMPETENCES.tropLong,
		})
		expect((await enregistrerCompetences(payload, utilisateur, { puces: [{ nom: 'Teint' }] })).ok).toBe(true)
		expect((await profilStocke(payload, compte)).languages?.map(({ name }) => name)).toEqual(['Teint'])
	})

	test('une puce neuve qui double une autre est refusée avec le message des compétences', async () => {
		const { payload, utilisateur } = await maquilleuse()
		expect(await enregistrerCompetences(payload, utilisateur, { puces: [{ nom: 'Teint' }, { nom: 'TEINT' }] })).toEqual(
			{
				ok: false,
				message: COMPETENCES.doublon,
			}
		)
	})

	test('E31 : l’échec de la base donne le message du site', async () => {
		const { payload, utilisateur } = await maquilleuse()
		const casse = Object.create(payload, {
			update: {
				value: async () => {
					throw new Error('connexion perdue')
				},
			},
		}) as Payload
		expect(await enregistrerCompetences(casse, utilisateur, { puces: [{ nom: 'Teint' }] })).toEqual({
			ok: false,
			message: MESSAGE_ECHEC,
		})
	})
})
