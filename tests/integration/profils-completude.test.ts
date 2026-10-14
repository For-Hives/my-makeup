import { afterEach, describe, expect, test } from 'bun:test'
import type { Profil } from '@/payload-types'
import {
	ANNECY,
	CAS_PARTAGES,
	completudeEnV3,
	documentDuCas,
	REPONSES_DE_L_ANCIEN_SITE,
	villeEcartee,
} from '../outils/cas-completude'
import { type CompteDeTest, creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { fichierPourFormulaire, fichierPourPayload } from '../outils/photos'
import { appelerRest, formulaireAvecFichier } from '../outils/rest'
import { viderLeStockage } from '../outils/s3'

/**
 * At every save, the server knows whether a profile is empty, active or publishable (ticket 044;
 * plan 02 §7.3, I20): it computes them with the single rule of the old site, stores them with the
 * date each took its value, and moves the status of the profile from draft to published and back,
 * unless an admin fixed it. Made-up values only, but for the commune, public reference data.
 */

afterEach(async () => {
	await Promise.all([viderLaBase(), viderLeStockage()])
})

// The tests that write one profile per case, or per condition, take longer than the default 5 s.

type Maquilleuse = CompteDeTest<'maquilleuse'>

/** The dates of the three flags. */
const DATES = ['actifDepuis', 'publiableDepuis', 'entierementVideDepuis'] as const

/** A makeup artist of the factory, with the identifier of the profile her account received. */
async function maquilleuseEtSonProfil(): Promise<{ compte: Maquilleuse; profil: number }> {
	const compte = await creerCompte('maquilleuse')
	const payload = await payloadDeTest()
	const [profil] = (await payload.find({ collection: 'profils', depth: 0, where: { pro: { equals: compte.id } } })).docs
	if (!profil) throw new Error('La fabrique n’a pas créé le profil de la maquilleuse.')
	return { compte, profil: profil.id }
}

/** The profile as the database holds it, read without access control. */
async function stocke(id: number): Promise<Profil> {
	const payload = await payloadDeTest()
	return payload.findByID({ collection: 'profils', id, depth: 0 })
}

/** The state of a stored profile, and its status. */
async function etat(id: number) {
	const profil = await stocke(id)
	return {
		completude: profil.completude,
		actif: profil.actif,
		publiable: profil.publiable,
		entierementVide: profil.entierementVide,
		statut: profil.statut,
	}
}

/** She changes her own profile through REST, as her space will. */
async function modifier(compte: Maquilleuse | CompteDeTest<'admin'>, profil: number, corps: Record<string, unknown>) {
	const reponse = await appelerRest('PATCH', `/api/profils/${profil}?depth=0`, {
		enTetes: compte.session.enTetes,
		corps,
	})
	if (reponse.statut !== 200) throw new Error(`Enregistrement refusé : ${reponse.statut} ${reponse.texte}`)
	return reponse
}

/** A photo she sends through REST, as the site sends it: the identifier of its media. */
async function envoyerUnePhoto(compte: Maquilleuse): Promise<number> {
	const { statut, corps, texte } = await appelerRest('POST', '/api/media?depth=0', {
		enTetes: compte.session.enTetes,
		formulaire: formulaireAvecFichier(fichierPourFormulaire()),
	})
	if (statut !== 201) throw new Error(`L’envoi de la photo a échoué : ${statut} ${texte}`)
	return (corps as { doc: { id: number } }).doc.id
}

const DESCRIPTION = 'Maquilleuse fictive, pour les essais du banc. '.repeat(5)

/** Each of the six conditions of a publishable profile, alone, as she fills it in her space. */
const SIX_CONDITIONS: [string, (compte: Maquilleuse) => Promise<Record<string, unknown>>][] = [
	['photo principale', async compte => ({ photoPrincipale: await envoyerUnePhoto(compte) })],
	['ville exploitable', async () => ({ commune: ANNECY })],
	['spécialité', async () => ({ specialite: 'Mariage' })],
	['offre avec un prix chiffré', async () => ({ prestations: [{ nom: 'Prestation fictive', prixAPartirDe: 80 }] })],
	['description de 200 caractères', async () => ({ description: DESCRIPTION })],
	['canal de contact', async () => ({ reseaux: { instagram: '@compte.fictif' } })],
]

/** Everything a publishable profile has. */
async function toutesLesConditions(compte: Maquilleuse): Promise<Record<string, unknown>> {
	const parties = await Promise.all(SIX_CONDITIONS.map(([, remplir]) => remplir(compte)))
	return Object.assign({}, ...parties)
}

/** What empties each of the six conditions again. */
const RIEN = {
	photoPrincipale: null,
	commune: null,
	specialite: null,
	prestations: [],
	description: null,
	reseaux: { instagram: null },
}

describe('Valeurs stockées égales à la fonction unique sur les cas partagés (I20, U01-U08)', () => {
	test('chaque cas partagé, écrit comme l’import l’écrira : l’état stocké est celui de la règle, et celui de l’ancien site', async () => {
		const payload = await payloadDeTest()
		for (const [i, cas] of CAS_PARTAGES.entries()) {
			const { compte, profil } = await maquilleuseEtSonProfil()
			const photo = async () =>
				(await payload.create({ collection: 'media', data: { owner: Number(compte.id) }, file: fichierPourPayload() }))
					.id
			await payload.update({ collection: 'profils', id: profil, data: await documentDuCas(cas.profil, photo) })

			const stockee = await etat(profil)
			const regle = completudeEnV3(cas.profil)
			expect([cas.nom, stockee]).toEqual([
				cas.nom,
				{
					completude: regle.score,
					actif: regle.actif,
					publiable: regle.publiable,
					entierementVide: regle.entierementVide,
					statut: regle.entierementVide ? 'brouillon' : 'publie',
				},
			])
			// The old site, on the same case: only the « city » criterion of a text that is no commune
			// leaves the score; the quote form, which nothing turns on, never counts.
			const ancien = REPONSES_DE_L_ANCIEN_SITE[i]
			if (!ancien) throw new Error(`Pas de réponse de l’ancien site pour « ${cas.nom} ».`)
			expect([cas.nom, stockee.actif, stockee.entierementVide]).toEqual([
				cas.nom,
				ancien.front.actif,
				ancien.api.entirelyEmpty,
			])
			expect([cas.nom, stockee.completude]).toEqual([cas.nom, ancien.front.score - (villeEcartee(cas.profil) ? 1 : 0)])
			expect([cas.nom, stockee.publiable]).toEqual([
				cas.nom,
				cas.options?.formulaireDevis ? false : ancien.front.publiable,
			])
		}
	}, 30_000)

	test('par REST, une modification de la maquilleuse recalcule l’état : actif, puis publiable', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()

		await modifier(compte, profil, {
			photoPrincipale: await envoyerUnePhoto(compte),
			commune: ANNECY,
			specialite: 'Mariage',
		})
		expect(await etat(profil)).toEqual({
			completude: 3,
			actif: true,
			publiable: false,
			entierementVide: false,
			statut: 'publie',
		})

		await modifier(compte, profil, {
			description: DESCRIPTION,
			prestations: [{ nom: 'Prestation fictive', prixTexte: 'Sur devis' }],
			reseaux: { siteWeb: 'https://example.test' },
		})
		expect((await etat(profil)).publiable).toBe(false)
		await modifier(compte, profil, { prestations: [{ nom: 'Prestation fictive', prixAPartirDe: 80 }] })
		expect(await etat(profil)).toEqual({
			completude: 6,
			actif: true,
			publiable: true,
			entierementVide: false,
			statut: 'publie',
		})
	})
})

describe('Profil créé vide : brouillon ; première des six conditions remplie : publié', () => {
	test('le profil créé avec le compte est vide, en brouillon, avec ses trois dates', async () => {
		const avant = Date.now()
		const { profil } = await maquilleuseEtSonProfil()

		const cree = await stocke(profil)
		expect(await etat(profil)).toEqual({
			completude: 0,
			actif: false,
			publiable: false,
			entierementVide: true,
			statut: 'brouillon',
		})
		expect(cree.statutFixe).toBe(false)
		for (const date of DATES) {
			expect([date, Date.parse(String(cree[date])) >= avant - 1000]).toEqual([date, true])
			expect([date, Date.parse(String(cree[date])) <= Date.now()]).toEqual([date, true])
		}
		expect((await appelerRest('GET', `/api/profils/${profil}`)).statut).toBe(404)
	})

	test('chacune des six conditions, seule, publie le profil, et le public le lit', async () => {
		for (const [condition, remplir] of SIX_CONDITIONS) {
			const { compte, profil } = await maquilleuseEtSonProfil()

			await modifier(compte, profil, await remplir(compte))

			expect([condition, await etat(profil)]).toMatchObject([condition, { entierementVide: false, statut: 'publie' }])
			expect([condition, (await appelerRest('GET', `/api/profils/${profil}`)).statut]).toEqual([condition, 200])
		}
	}, 30_000)

	test('vidé de tout ce qui comptait, il repasse en brouillon, et le public ne le lit plus', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		await modifier(compte, profil, await toutesLesConditions(compte))
		expect(await etat(profil)).toMatchObject({ publiable: true, statut: 'publie' })

		await modifier(compte, profil, RIEN)

		expect(await etat(profil)).toMatchObject({ entierementVide: true, publiable: false, statut: 'brouillon' })
		expect((await appelerRest('GET', `/api/profils/${profil}`)).statut).toBe(404)
	})

	test('un téléphone qu’elle ne montre pas n’est pas un canal de contact ; montré, il l’est', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		const coordonnees = { telephone: '06 39 98 55 55', email: 'contact-fictif@example.test' }

		await modifier(compte, profil, { coordonnees, contactPublic: false })
		expect(await etat(profil)).toMatchObject({ entierementVide: true, statut: 'brouillon' })

		await modifier(compte, profil, { contactPublic: true })
		expect(await etat(profil)).toMatchObject({ entierementVide: false, statut: 'publie' })
	})

	test('une date ne bouge que quand sa case change de valeur', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		const cree = await stocke(profil)

		await modifier(compte, profil, { prenom: 'Prénom' })
		const renomme = await stocke(profil)
		for (const date of DATES) expect([date, renomme[date]]).toEqual([date, cree[date]])

		await modifier(compte, profil, { specialite: 'Mariage' })
		const rempli = await stocke(profil)
		expect(rempli.actifDepuis).toBe(cree.actifDepuis)
		expect(rempli.publiableDepuis).toBe(cree.publiableDepuis)
		expect(Date.parse(String(rempli.entierementVideDepuis))).toBeGreaterThan(
			Date.parse(String(cree.entierementVideDepuis))
		)
	})
})

describe('Un profil qui n’a qu’un nom reste entièrement vide', () => {
	test('prénom, nom et nom d’artiste : 2 sur 13, entièrement vide, en brouillon', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()

		await modifier(compte, profil, { prenom: 'Prénom', nom: 'Fictif', nomArtiste: 'Studio Fictif' })

		expect(await etat(profil)).toEqual({
			completude: 2,
			actif: false,
			publiable: false,
			entierementVide: true,
			statut: 'brouillon',
		})
		expect((await appelerRest('GET', `/api/profils/${profil}`)).statut).toBe(404)
	})

	test('ni les listes, ni la galerie, ni le rayon ne sont une des six conditions', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()

		await modifier(compte, profil, {
			prenom: 'Prénom',
			nom: 'Fictif',
			competences: [{ nom: 'Compétence fictive' }],
			langues: [{ nom: 'Langue fictive' }],
			formations: [{ diplome: 'Diplôme fictif' }],
			experiences: [{ poste: 'Poste fictif' }],
			prestations: [{ nom: 'Prestation fictive', prixTexte: 'Sur devis' }],
			galerie: [await envoyerUnePhoto(compte)],
			rayonKm: 30,
			aDomicile: true,
		})

		expect(await etat(profil)).toMatchObject({ entierementVide: true, statut: 'brouillon' })
	})
})

describe('Un profil masqué reste masqué quelle que soit la sauvegarde', () => {
	test('rempli, vidé, rempli par la maquilleuse, enregistré par l’admin ou par le serveur : toujours masqué', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		const admin = await creerCompte('admin')
		await modifier(compte, profil, await toutesLesConditions(compte))
		await modifier(admin, profil, { statut: 'masque', motif: 'Masqué pour le test' })
		expect(await etat(profil)).toMatchObject({ publiable: true, statut: 'masque' })

		await modifier(compte, profil, RIEN)
		expect(await etat(profil)).toMatchObject({ entierementVide: true, statut: 'masque' })
		await modifier(compte, profil, await toutesLesConditions(compte))
		expect(await etat(profil)).toMatchObject({ publiable: true, statut: 'masque' })
		await modifier(admin, profil, { noteInterne: 'Relue' })
		expect((await etat(profil)).statut).toBe('masque')
		// Even handed back to the rule, a hidden profile stays hidden: only an admin shows it again.
		await modifier(admin, profil, { statutFixe: false })
		expect((await etat(profil)).statut).toBe('masque')
		const payload = await payloadDeTest()
		await payload.update({ collection: 'profils', id: profil, data: { prenom: 'Par le serveur' } })
		expect((await etat(profil)).statut).toBe('masque')
		expect((await appelerRest('GET', `/api/profils/${profil}`)).statut).toBe(404)
	}, 30_000)
})

describe('Un statut posé par l’admin n’est jamais écrasé', () => {
	test('un brouillon posé sur un profil rempli, une publication posée sur un profil vide : gardés', async () => {
		const admin = await creerCompte('admin')
		const rempli = await maquilleuseEtSonProfil()
		await modifier(rempli.compte, rempli.profil, { specialite: 'Mariage' })
		const vide = await maquilleuseEtSonProfil()

		await modifier(admin, rempli.profil, { statut: 'brouillon' })
		await modifier(admin, vide.profil, { statut: 'publie' })
		await modifier(rempli.compte, rempli.profil, { description: DESCRIPTION })
		await modifier(vide.compte, vide.profil, { prenom: 'Prénom' })

		expect(await etat(rempli.profil)).toMatchObject({ entierementVide: false, statut: 'brouillon' })
		expect(await etat(vide.profil)).toMatchObject({ entierementVide: true, statut: 'publie' })
		expect((await stocke(rempli.profil)).statutFixe).toBe(true)
		expect((await stocke(vide.profil)).statutFixe).toBe(true)
	})

	test('l’admin décoche « statut fixé » : le statut suit de nouveau la règle, dès cet enregistrement', async () => {
		const admin = await creerCompte('admin')
		const { compte, profil } = await maquilleuseEtSonProfil()
		await modifier(compte, profil, { specialite: 'Mariage' })
		await modifier(admin, profil, { statut: 'brouillon' })

		await modifier(admin, profil, { statutFixe: false })

		expect(await etat(profil)).toMatchObject({ statut: 'publie' })
		expect((await stocke(profil)).statutFixe).toBe(false)
	})
})

describe('Valeurs envoyées par la maquilleuse ignorées et recalculées', () => {
	test('par REST : l’état, ses dates et « statut fixé » envoyés sont ignorés ; le serveur les recalcule', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		const avant = await stocke(profil)

		const { corps } = await modifier(compte, profil, {
			prenom: 'Prénom',
			completude: 13,
			actif: true,
			publiable: true,
			entierementVide: false,
			actifDepuis: '2020-01-01T00:00:00.000Z',
			publiableDepuis: '2020-01-01T00:00:00.000Z',
			entierementVideDepuis: '2020-01-01T00:00:00.000Z',
			statut: 'publie',
			statutFixe: true,
		})

		const attendu = {
			completude: 0,
			actif: false,
			publiable: false,
			entierementVide: true,
			statut: 'brouillon',
		} as const
		expect(await etat(profil)).toEqual(attendu)
		expect((corps as { doc: unknown }).doc).toMatchObject(attendu)
		const apres = await stocke(profil)
		expect(apres.statutFixe).toBe(false)
		for (const date of DATES) expect([date, apres[date]]).toEqual([date, avant[date]])
	})

	test('par l’API locale avec les règles actives, de même ; et le serveur lui-même ne les écrit pas', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		const payload = await payloadDeTest()
		const utilisateur = {
			...(await payload.findByID({ collection: 'pros', id: compte.id, depth: 0 })),
			collection: 'pros',
		}
		const envoye = { completude: 13, actif: true, publiable: true, entierementVide: false }

		await payload.update({
			collection: 'profils',
			id: profil,
			data: envoye,
			overrideAccess: false,
			user: utilisateur as never,
		})
		expect(await etat(profil)).toMatchObject({ completude: 0, actif: false, publiable: false, entierementVide: true })
		await payload.update({ collection: 'profils', id: profil, data: envoye })
		expect(await etat(profil)).toMatchObject({ completude: 0, actif: false, publiable: false, entierementVide: true })
	})
})
