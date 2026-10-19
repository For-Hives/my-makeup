import { afterEach, describe, expect, test } from 'bun:test'
import type { Profile } from '@/payload-types'
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
 * unless an admin chose another status. Made-up values only, but for the commune, public reference data.
 */

afterEach(async () => {
	await Promise.all([viderLaBase(), viderLeStockage()])
})

// The tests that write one profile per case, or per condition, take longer than the default 5 s.

type Maquilleuse = CompteDeTest<'maquilleuse'>

/** The dates of the three flags. */
const DATES = ['activeSince', 'publishableSince', 'fullyEmptySince'] as const

/** A makeup artist of the factory, with the identifier of the profile her account received. */
async function maquilleuseEtSonProfil(): Promise<{ compte: Maquilleuse; profil: number }> {
	const compte = await creerCompte('maquilleuse')
	const payload = await payloadDeTest()
	const [profil] = (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } }))
		.docs
	if (!profil) throw new Error('La fabrique n’a pas créé le profil de la maquilleuse.')
	return { compte, profil: profil.id }
}

/** The profile as the database holds it, read without access control. */
async function stocke(id: number): Promise<Profile> {
	const payload = await payloadDeTest()
	return payload.findByID({ collection: 'profiles', id, depth: 0 })
}

/** The state of a stored profile, and its status. */
async function etat(id: number) {
	const profil = await stocke(id)
	return {
		completeness: profil.completeness,
		active: profil.active,
		publishable: profil.publishable,
		fullyEmpty: profil.fullyEmpty,
		status: profil.status,
	}
}

/** She changes her own profile through REST, as her space will. */
async function modifier(compte: Maquilleuse | CompteDeTest<'admin'>, profil: number, corps: Record<string, unknown>) {
	const reponse = await appelerRest('PATCH', `/api/profiles/${profil}?depth=0`, {
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
	['photo principale', async compte => ({ mainPicture: await envoyerUnePhoto(compte) })],
	['ville exploitable', async () => ({ city: ANNECY })],
	['spécialité', async () => ({ specialty: 'Mariage' })],
	['offre avec un prix chiffré', async () => ({ prestations: [{ nom: 'Prestation fictive', prixAPartirDe: 80 }] })],
	['description de 200 caractères', async () => ({ description: DESCRIPTION })],
	['canal de contact', async () => ({ networks: { instagram: '@compte.fictif' } })],
]

/** Everything a publishable profile has. */
async function toutesLesConditions(compte: Maquilleuse): Promise<Record<string, unknown>> {
	const parties = await Promise.all(SIX_CONDITIONS.map(([, remplir]) => remplir(compte)))
	return Object.assign({}, ...parties)
}

/** What empties each of the six conditions again. */
const RIEN = {
	mainPicture: null,
	city: null,
	specialty: null,
	prestations: [],
	description: null,
	networks: { instagram: null },
}

describe('Valeurs stockées égales à la fonction unique sur les cas partagés (I20, U01-U08)', () => {
	test('chaque cas partagé, écrit comme l’import l’écrira : l’état stocké est celui de la règle, et celui de l’ancien site', async () => {
		const payload = await payloadDeTest()
		for (const [i, cas] of CAS_PARTAGES.entries()) {
			const { compte, profil } = await maquilleuseEtSonProfil()
			const photo = async () =>
				(await payload.create({ collection: 'media', data: { owner: Number(compte.id) }, file: fichierPourPayload() }))
					.id
			await payload.update({ collection: 'profiles', id: profil, data: await documentDuCas(cas.profil, photo) })

			const stockee = await etat(profil)
			const regle = completudeEnV3(cas.profil)
			expect([cas.nom, stockee]).toEqual([
				cas.nom,
				{
					completeness: regle.score,
					active: regle.actif,
					publishable: regle.publiable,
					fullyEmpty: regle.entierementVide,
					status: regle.entierementVide ? 'draft' : 'published',
				},
			])
			// The old site, on the same case: only the « city » criterion of a text that is no commune
			// leaves the score; the quote form, which nothing turns on, never counts.
			const ancien = REPONSES_DE_L_ANCIEN_SITE[i]
			if (!ancien) throw new Error(`Pas de réponse de l’ancien site pour « ${cas.nom} ».`)
			expect([cas.nom, stockee.active, stockee.fullyEmpty]).toEqual([
				cas.nom,
				ancien.front.actif,
				ancien.api.entirelyEmpty,
			])
			expect([cas.nom, stockee.completeness]).toEqual([
				cas.nom,
				ancien.front.score - (villeEcartee(cas.profil) ? 1 : 0),
			])
			expect([cas.nom, stockee.publishable]).toEqual([
				cas.nom,
				cas.options?.formulaireDevis ? false : ancien.front.publiable,
			])
		}
	}, 30_000)

	test('par REST, une modification de la maquilleuse recalcule l’état : actif, puis publiable', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()

		await modifier(compte, profil, {
			mainPicture: await envoyerUnePhoto(compte),
			city: ANNECY,
			specialty: 'Mariage',
		})
		expect(await etat(profil)).toEqual({
			completeness: 3,
			active: true,
			publishable: false,
			fullyEmpty: false,
			status: 'published',
		})

		await modifier(compte, profil, {
			description: DESCRIPTION,
			prestations: [{ nom: 'Prestation fictive', prixTexte: 'Sur devis' }],
			networks: { website: 'https://example.test' },
		})
		expect((await etat(profil)).publishable).toBe(false)
		await modifier(compte, profil, { prestations: [{ nom: 'Prestation fictive', prixAPartirDe: 80 }] })
		expect(await etat(profil)).toEqual({
			completeness: 6,
			active: true,
			publishable: true,
			fullyEmpty: false,
			status: 'published',
		})
	})
})

describe('Profile créé vide : brouillon ; première des six conditions remplie : publié', () => {
	test('le profil créé avec le compte est vide, en brouillon, avec ses trois dates', async () => {
		const avant = Date.now()
		const { profil } = await maquilleuseEtSonProfil()

		const cree = await stocke(profil)
		expect(await etat(profil)).toEqual({
			completeness: 0,
			active: false,
			publishable: false,
			fullyEmpty: true,
			status: 'draft',
		})
		expect(cree.chosenStatus).toBe('automatic')
		for (const date of DATES) {
			expect([date, Date.parse(String(cree[date])) >= avant - 1000]).toEqual([date, true])
			expect([date, Date.parse(String(cree[date])) <= Date.now()]).toEqual([date, true])
		}
		expect((await appelerRest('GET', `/api/profiles/${profil}`)).statut).toBe(404)
	})

	test('chacune des six conditions, seule, publie le profil, et le public le lit', async () => {
		for (const [condition, remplir] of SIX_CONDITIONS) {
			const { compte, profil } = await maquilleuseEtSonProfil()

			await modifier(compte, profil, await remplir(compte))

			expect([condition, await etat(profil)]).toMatchObject([condition, { fullyEmpty: false, status: 'published' }])
			expect([condition, (await appelerRest('GET', `/api/profiles/${profil}`)).statut]).toEqual([condition, 200])
		}
	}, 30_000)

	test('une commune de plus de six mots est une ville exploitable : seule, elle publie le profil', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()

		// The only name of the official list (14/10/2026) the rule refused as it is.
		await modifier(compte, profil, { city: { name: 'Pont de Montvert - Sud Mont Lozère', inseeCode: '48116' } })

		expect(await etat(profil)).toEqual({
			completeness: 1,
			active: false,
			publishable: false,
			fullyEmpty: false,
			status: 'published',
		})
		await modifier(compte, profil, { mainPicture: await envoyerUnePhoto(compte), specialty: 'Mariage' })
		expect(await etat(profil)).toMatchObject({ active: true, status: 'published' })
	})

	test('vidé de tout ce qui comptait, il repasse en brouillon, et le public ne le lit plus', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		await modifier(compte, profil, await toutesLesConditions(compte))
		expect(await etat(profil)).toMatchObject({ publishable: true, status: 'published' })

		await modifier(compte, profil, RIEN)

		expect(await etat(profil)).toMatchObject({ fullyEmpty: true, publishable: false, status: 'draft' })
		expect((await appelerRest('GET', `/api/profiles/${profil}`)).statut).toBe(404)
	})

	test('un téléphone qu’elle ne montre pas n’est pas un canal de contact ; montré, il l’est', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		const coordonnees = { phone: '06 39 98 55 55', email: 'contact-fictif@example.test' }

		await modifier(compte, profil, { contactDetails: coordonnees, publicContact: false })
		expect(await etat(profil)).toMatchObject({ fullyEmpty: true, status: 'draft' })

		await modifier(compte, profil, { publicContact: true })
		expect(await etat(profil)).toMatchObject({ fullyEmpty: false, status: 'published' })
	})

	test('une date ne bouge que quand sa case change de valeur', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		const cree = await stocke(profil)

		await modifier(compte, profil, { firstName: 'Prénom' })
		const renomme = await stocke(profil)
		for (const date of DATES) expect([date, renomme[date]]).toEqual([date, cree[date]])

		await modifier(compte, profil, { specialty: 'Mariage' })
		const rempli = await stocke(profil)
		expect(rempli.activeSince).toBe(cree.activeSince)
		expect(rempli.publishableSince).toBe(cree.publishableSince)
		expect(Date.parse(String(rempli.fullyEmptySince))).toBeGreaterThan(Date.parse(String(cree.fullyEmptySince)))
	})
})

describe('Un profil qui n’a qu’un nom reste entièrement vide', () => {
	test('prénom, nom et nom d’artiste : 2 sur 13, entièrement vide, en brouillon', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()

		await modifier(compte, profil, { firstName: 'Prénom', lastName: 'Fictif', artistName: 'Studio Fictif' })

		expect(await etat(profil)).toEqual({
			completeness: 2,
			active: false,
			publishable: false,
			fullyEmpty: true,
			status: 'draft',
		})
		expect((await appelerRest('GET', `/api/profiles/${profil}`)).statut).toBe(404)
	})

	test('ni les listes, ni la galerie, ni le rayon ne sont une des six conditions', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()

		await modifier(compte, profil, {
			firstName: 'Prénom',
			lastName: 'Fictif',
			competences: [{ nom: 'Compétence fictive' }],
			langues: [{ nom: 'Langue fictive' }],
			formations: [{ diplome: 'Diplôme fictif' }],
			experiences: [{ poste: 'Poste fictif' }],
			prestations: [{ nom: 'Prestation fictive', prixTexte: 'Sur devis' }],
			gallery: [await envoyerUnePhoto(compte)],
			rayonKm: 30,
			homeService: true,
		})

		expect(await etat(profil)).toMatchObject({ fullyEmpty: true, status: 'draft' })
	})
})

describe('Un profil masqué reste masqué quelle que soit la sauvegarde', () => {
	test('rempli, vidé, rempli par la maquilleuse, enregistré par l’admin ou par le serveur : toujours masqué', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		const admin = await creerCompte('admin')
		await modifier(compte, profil, await toutesLesConditions(compte))
		await modifier(admin, profil, { chosenStatus: 'hidden', reason: 'Masqué pour le test' })
		expect(await etat(profil)).toMatchObject({ publishable: true, status: 'hidden' })

		await modifier(compte, profil, RIEN)
		expect(await etat(profil)).toMatchObject({ fullyEmpty: true, status: 'hidden' })
		await modifier(compte, profil, await toutesLesConditions(compte))
		expect(await etat(profil)).toMatchObject({ publishable: true, status: 'hidden' })
		await modifier(admin, profil, { internalNote: 'Relue' })
		expect((await etat(profil)).status).toBe('hidden')
		// An admin's form that sends another status, with the stored choice: the status is not hers to write.
		await modifier(admin, profil, { status: 'published', chosenStatus: 'hidden', internalNote: 'Relue encore' })
		expect((await etat(profil)).status).toBe('hidden')
		const payload = await payloadDeTest()
		await payload.update({ collection: 'profiles', id: profil, data: { firstName: 'Par le serveur' } })
		expect((await etat(profil)).status).toBe('hidden')
		expect((await appelerRest('GET', `/api/profiles/${profil}`)).statut).toBe(404)

		// Only an admin shows it again, by handing it back to the rule.
		await modifier(admin, profil, { chosenStatus: 'automatic' })
		expect(await etat(profil)).toMatchObject({ publishable: true, status: 'published' })
	}, 30_000)
})

describe('Un statut posé par l’admin n’est jamais écrasé', () => {
	test('un brouillon posé sur un profil rempli, une publication posée sur un profil vide : gardés', async () => {
		const admin = await creerCompte('admin')
		const rempli = await maquilleuseEtSonProfil()
		await modifier(rempli.compte, rempli.profil, { specialty: 'Mariage' })
		const vide = await maquilleuseEtSonProfil()

		await modifier(admin, rempli.profil, { chosenStatus: 'draft' })
		await modifier(admin, vide.profil, { chosenStatus: 'published' })
		await modifier(rempli.compte, rempli.profil, { description: DESCRIPTION })
		await modifier(vide.compte, vide.profil, { firstName: 'Prénom' })

		expect(await etat(rempli.profil)).toMatchObject({ fullyEmpty: false, status: 'draft' })
		expect(await etat(vide.profil)).toMatchObject({ fullyEmpty: true, status: 'published' })
		expect((await stocke(rempli.profil)).chosenStatus).toBe('draft')
		expect((await stocke(vide.profil)).chosenStatus).toBe('published')
	})

	test('un formulaire d’admin chargé avant l’enregistrement de la maquilleuse ne fixe aucun statut', async () => {
		const admin = await creerCompte('admin')
		const { compte, profil } = await maquilleuseEtSonProfil()
		// What the admin's form holds, loaded while the profile was still an empty draft.
		const charge = await stocke(profil)
		await modifier(compte, profil, { specialty: 'Mariage' })
		expect(await etat(profil)).toMatchObject({ status: 'published' })

		// She saves her note, with the status and the choice her form loaded.
		await modifier(admin, profil, { statut: charge.status, chosenStatus: charge.chosenStatus, internalNote: 'Relue' })

		expect(await etat(profil)).toMatchObject({ fullyEmpty: false, status: 'published' })
		expect((await stocke(profil)).chosenStatus).toBe('automatic')
		await modifier(compte, profil, { specialty: null })
		expect(await etat(profil)).toMatchObject({ fullyEmpty: true, status: 'draft' })
	})

	test('le formulaire entier renvoyé tel qu’il a été chargé : la règle décide, rien n’est fixé', async () => {
		const admin = await creerCompte('admin')
		const { compte, profil } = await maquilleuseEtSonProfil()
		// The admin panel sends every field of the form it loaded.
		const { corps } = await appelerRest('GET', `/api/profiles/${profil}?depth=0`, { enTetes: admin.session.enTetes })
		const { id: _id, createdAt: _cree, updatedAt: _modifie, ...formulaire } = corps as Record<string, unknown>
		await modifier(compte, profil, { specialty: 'Mariage' })

		await modifier(admin, profil, { ...formulaire, internalNote: 'Relue' })

		// Her speciality is lost with the old form, so the profile is empty again: a draft by the rule.
		expect(await etat(profil)).toMatchObject({ fullyEmpty: true, status: 'draft' })
		expect((await stocke(profil)).chosenStatus).toBe('automatic')
		await modifier(compte, profil, { specialty: 'Mariage' })
		expect(await etat(profil)).toMatchObject({ fullyEmpty: false, status: 'published' })
	})

	test('l’admin choisit « automatique » : le statut suit de nouveau la règle, dès cet enregistrement', async () => {
		const admin = await creerCompte('admin')
		const { compte, profil } = await maquilleuseEtSonProfil()
		await modifier(compte, profil, { specialty: 'Mariage' })
		await modifier(admin, profil, { chosenStatus: 'draft' })
		expect(await etat(profil)).toMatchObject({ status: 'draft' })

		await modifier(admin, profil, { chosenStatus: 'automatic' })

		expect(await etat(profil)).toMatchObject({ status: 'published' })
		expect((await stocke(profil)).chosenStatus).toBe('automatic')
	})
})

describe('Valeurs envoyées par la maquilleuse ignorées et recalculées', () => {
	test('par REST : l’état, ses dates, le statut et son choix envoyés sont ignorés ; le serveur les recalcule', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		const avant = await stocke(profil)

		const { corps } = await modifier(compte, profil, {
			firstName: 'Prénom',
			completeness: 13,
			active: true,
			publishable: true,
			fullyEmpty: false,
			activeSince: '2020-01-01T00:00:00.000Z',
			publishableSince: '2020-01-01T00:00:00.000Z',
			fullyEmptySince: '2020-01-01T00:00:00.000Z',
			status: 'published',
			chosenStatus: 'published',
		})

		const attendu = {
			completeness: 0,
			active: false,
			publishable: false,
			fullyEmpty: true,
			status: 'draft',
		} as const
		expect(await etat(profil)).toEqual(attendu)
		expect((corps as { doc: unknown }).doc).toMatchObject(attendu)
		const apres = await stocke(profil)
		expect(apres.chosenStatus).toBe('automatic')
		for (const date of DATES) expect([date, apres[date]]).toEqual([date, avant[date]])
	})

	test('par l’API locale avec les règles actives, de même ; et le serveur lui-même ne les écrit pas', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		const payload = await payloadDeTest()
		const utilisateur = {
			...(await payload.findByID({ collection: 'pros', id: compte.id, depth: 0 })),
			collection: 'pros',
		}
		const envoye = { completeness: 13, active: true, publishable: true, fullyEmpty: false }

		await payload.update({
			collection: 'profiles',
			id: profil,
			data: envoye,
			overrideAccess: false,
			user: utilisateur as never,
		})
		expect(await etat(profil)).toMatchObject({ completeness: 0, active: false, publishable: false, fullyEmpty: true })
		await payload.update({ collection: 'profiles', id: profil, data: envoye })
		expect(await etat(profil)).toMatchObject({ completeness: 0, active: false, publishable: false, fullyEmpty: true })
	})
})
