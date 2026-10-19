import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { enregistrerListe } from '@/lib/espace/enregistrer-liste'
import { EXPERIENCES } from '@/lib/espace/experiences'
import { FORMATIONS } from '@/lib/espace/formations'
import type { DefinitionDeListe, ValeursDeLigne } from '@/lib/espace/liste'
import { profilDeLaMaquilleuse, type UtilisateurDeLEspace } from '@/lib/espace/mon-profil'
import { PRESTATIONS } from '@/lib/espace/prestations'
import { MESSAGE_ECHEC } from '@/lib/espace/resultat'
import { ANNECY } from '../outils/cas-completude'
import { type CompteDeTest, creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { fichierPourPayload } from '../outils/photos'
import { viderLeStockage } from '../outils/s3'

/**
 * The lists saved from her space (tickets 129 to 131; docs/qualite.md §3 L1, plan 02 U29, U30, U04,
 * E31): rows with an identifier each, the order kept, a refusal that leaves the database as it was,
 * a price read by the single rule, and the options of an offer kept. Made-up values only.
 */

afterEach(async () => {
	await Promise.all([viderLaBase(), viderLeStockage()])
})

type Maquilleuse = CompteDeTest<'maquilleuse'>

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

async function maquilleuse() {
	const compte = await creerCompte('maquilleuse')
	const payload = await payloadDeTest()
	const doc = await payload.findByID({ collection: 'pros', id: compte.id, depth: 0, overrideAccess: true })
	const utilisateur = { ...doc, collection: 'pros' } as UtilisateurDeLEspace
	const profil = await profilStocke(payload, compte)
	return { compte, payload, utilisateur, id: profil.id }
}

const enregistrer = (
	m: Awaited<ReturnType<typeof maquilleuse>>,
	definition: DefinitionDeListe,
	lignes: readonly {
		id?: string
		valeurs: ValeursDeLigne
		options?: readonly { id?: string; valeurs: ValeursDeLigne }[]
	}[]
) => enregistrerListe(m.payload, m.utilisateur, { lignes }, definition)

const EXPERIENCE: ValeursDeLigne = {
	poste: 'Maquilleuse',
	entreprise: 'Studio Fictif',
	ville: 'Lyon',
	debut: '2020-03-01',
	fin: '',
	description: '',
}
const FORMATION: ValeursDeLigne = {
	diplome: 'CAP esthétique',
	ecole: 'École Fictive',
	obtenuLe: '2018-06-30',
	description: '',
}

describe('129 : les expériences', () => {
	test('L1 : deux lignes identiques ont chacune leur identifiant, et se changent séparément', async () => {
		const m = await maquilleuse()
		const premier = await enregistrer(m, EXPERIENCES, [{ valeurs: EXPERIENCE }, { valeurs: EXPERIENCE }])
		if (!premier.ok) throw new Error(premier.message)
		const [a, b] = premier.valeurs.lignes
		expect(a?.id).toBeTruthy()
		expect(b?.id).toBeTruthy()
		expect(a?.id).not.toBe(b?.id)

		// Changing the second leaves the first; the order and the identifiers stay.
		const second = await enregistrer(m, EXPERIENCES, [
			{ id: a?.id, valeurs: EXPERIENCE },
			{ id: b?.id, valeurs: { ...EXPERIENCE, poste: 'Cheffe maquilleuse' } },
		])
		expect(second.ok && second.valeurs.lignes.map(ligne => [ligne.id, ligne.valeurs.poste])).toEqual([
			[a?.id, 'Maquilleuse'],
			[b?.id, 'Cheffe maquilleuse'],
		])

		// Removing the first leaves the second, with its identifier.
		const troisieme = await enregistrer(m, EXPERIENCES, [
			{ id: b?.id, valeurs: { ...EXPERIENCE, poste: 'Cheffe maquilleuse' } },
		])
		expect(troisieme.ok && troisieme.valeurs.lignes.map(ligne => ligne.id)).toEqual([b?.id as string])
		expect((await profilStocke(m.payload, m.compte)).experiences).toHaveLength(1)
	})

	test('les jours sont gardés tels qu’écrits, l’ordre est celui de l’envoi, la page lit la même chose', async () => {
		const m = await maquilleuse()
		const lignes = [
			{ valeurs: { ...EXPERIENCE, poste: 'Troisième', debut: '2022-01-15', fin: '2022-12-31' } },
			{ valeurs: { ...EXPERIENCE, poste: 'Première', debut: '2018-01-01' } },
		]
		const resultat = await enregistrer(m, EXPERIENCES, lignes)

		expect(resultat.ok && resultat.valeurs.lignes.map(ligne => ligne.valeurs)).toEqual(
			lignes.map(ligne => ligne.valeurs)
		)
		const stocke = (await profilStocke(m.payload, m.compte)).experiences
		expect(stocke?.map(ligne => ligne.poste)).toEqual(['Troisième', 'Première'])
		expect(stocke?.[0]).toMatchObject({ debut: '2022-01-15T12:00:00.000Z', fin: '2022-12-31T12:00:00.000Z' })
		expect(stocke?.[1]?.fin ?? null).toBeNull()
		const page = await profilDeLaMaquilleuse(m.payload, m.utilisateur)
		expect(page?.experiences?.map(ligne => ligne.poste)).toEqual(['Troisième', 'Première'])
	})

	test('U30, E31 : une fin avant le début est refusée avec le nom de la ligne, la base ne bouge pas', async () => {
		const m = await maquilleuse()
		await enregistrer(m, EXPERIENCES, [{ valeurs: EXPERIENCE }])
		const avant = await profilStocke(m.payload, m.compte)

		const resultat = await enregistrer(m, EXPERIENCES, [
			{ valeurs: EXPERIENCE },
			{ valeurs: { ...EXPERIENCE, entreprise: 'Autre Studio', debut: '2022-05-01', fin: '2021-01-01' } },
		])

		expect(resultat).toEqual({
			ok: false,
			message: 'La ligne « Autre Studio » n’est pas valide : La fin d’une expérience ne peut pas précéder son début.',
		})
		const apres = await profilStocke(m.payload, m.compte)
		expect(apres.updatedAt).toBe(avant.updatedAt)
		expect(apres.experiences).toEqual(avant.experiences)
	})

	test('une ligne neuve sans son entreprise est refusée ; une ligne importée vide ne bloque pas l’enregistrement des autres', async () => {
		const m = await maquilleuse()
		const sansEntreprise = await enregistrer(m, EXPERIENCES, [{ valeurs: { ...EXPERIENCE, entreprise: '' } }])
		expect(sansEntreprise).toMatchObject({ ok: false })
		expect((await profilStocke(m.payload, m.compte)).experiences ?? []).toHaveLength(0)

		// A row of the old site with empty fields (SCHEMA.md §2, rule 2), written as the import writes it.
		await m.payload.update({
			collection: 'profiles',
			id: m.id,
			data: { experiences: [{ poste: 'Reprise', entreprise: null }] },
		})
		const stockee = (await profilStocke(m.payload, m.compte)).experiences?.[0]
		const lignes = [
			{
				id: stockee?.id ?? undefined,
				valeurs: { ...EXPERIENCE, poste: 'Reprise', entreprise: '', debut: '', ville: '' },
			},
			{ valeurs: EXPERIENCE },
		]
		const resultat = await enregistrer(m, EXPERIENCES, lignes)
		expect(resultat.ok && resultat.valeurs.lignes).toHaveLength(2)
		expect(resultat.ok && resultat.valeurs.lignes[0]?.id).toBe(stockee?.id as string)
	})

	test('un identifiant inventé est une ligne neuve, jamais une ligne d’un autre profil (I02)', async () => {
		const a = await maquilleuse()
		const b = await maquilleuse()
		const chez = await enregistrer(a, EXPERIENCES, [{ valeurs: EXPERIENCE }])
		if (!chez.ok) throw new Error(chez.message)
		const idDeA = chez.valeurs.lignes[0]?.id

		const resultat = await enregistrer(b, EXPERIENCES, [{ id: idDeA, valeurs: { ...EXPERIENCE, poste: 'Chez b' } }])

		expect(resultat.ok && resultat.valeurs.lignes[0]?.id).not.toBe(idDeA)
		expect((await profilStocke(a.payload, a.compte)).experiences?.[0]?.poste).toBe('Maquilleuse')
	})

	test('une clé de plus refuse la requête entière, un compte sans profil reçoit le message du site', async () => {
		const m = await maquilleuse()
		const resultat = await enregistrerListe(
			m.payload,
			m.utilisateur,
			{ lignes: [{ valeurs: EXPERIENCE }], status: 'published' },
			EXPERIENCES
		)
		expect(resultat).toEqual({ ok: false, message: MESSAGE_ECHEC })
		expect((await profilStocke(m.payload, m.compte)).experiences ?? []).toHaveLength(0)

		const sansProfil = await creerCompte('maquilleuse-sans-profil')
		const doc = await m.payload.findByID({ collection: 'pros', id: sansProfil.id, depth: 0, overrideAccess: true })
		expect(
			await enregistrerListe(
				m.payload,
				{ ...doc, collection: 'pros' } as UtilisateurDeLEspace,
				{ lignes: [] },
				EXPERIENCES
			)
		).toEqual({ ok: false, message: MESSAGE_ECHEC })
	})
})

describe('130 : les formations', () => {
	test('L1 : les lignes sont écrites dans l’ordre, chacune avec son identifiant', async () => {
		const m = await maquilleuse()
		const resultat = await enregistrer(m, FORMATIONS, [
			{ valeurs: FORMATION },
			{ valeurs: FORMATION },
			{ valeurs: { ...FORMATION, diplome: 'BP esthétique' } },
		])
		if (!resultat.ok) throw new Error(resultat.message)
		const ids = resultat.valeurs.lignes.map(ligne => ligne.id)
		expect(new Set(ids).size).toBe(3)
		expect((await profilStocke(m.payload, m.compte)).formations?.map(ligne => ligne.diplome)).toEqual([
			'CAP esthétique',
			'CAP esthétique',
			'BP esthétique',
		])
		expect((await profilStocke(m.payload, m.compte)).formations?.[0]?.obtenuLe).toBe('2018-06-30T12:00:00.000Z')
	})

	test('U30, E31 : une date à plus d’un an dans le futur est refusée, la base ne bouge pas', async () => {
		const m = await maquilleuse()
		await enregistrer(m, FORMATIONS, [{ valeurs: FORMATION }])
		const avant = await profilStocke(m.payload, m.compte)

		const resultat = await enregistrer(m, FORMATIONS, [
			{ valeurs: FORMATION },
			{ valeurs: { ...FORMATION, diplome: 'Futur', obtenuLe: '2099-01-01' } },
		])

		expect(resultat).toEqual({
			ok: false,
			message:
				'La ligne « Futur » n’est pas valide : Une date d’obtention ne peut pas dépasser d’un an la date du jour.',
		})
		expect((await profilStocke(m.payload, m.compte)).updatedAt).toBe(avant.updatedAt)
	})

	test('l’ordre change quand on envoie les lignes dans un autre ordre, et vider la liste la vide', async () => {
		const m = await maquilleuse()
		const premier = await enregistrer(m, FORMATIONS, [
			{ valeurs: FORMATION },
			{ valeurs: { ...FORMATION, diplome: 'BP esthétique' } },
		])
		if (!premier.ok) throw new Error(premier.message)
		const [a, b] = premier.valeurs.lignes
		const inverse = await enregistrer(m, FORMATIONS, [
			{ id: b?.id, valeurs: b?.valeurs ?? {} },
			{ id: a?.id, valeurs: a?.valeurs ?? {} },
		])
		expect(inverse.ok && inverse.valeurs.lignes.map(ligne => ligne.id)).toEqual([b?.id as string, a?.id as string])

		await enregistrer(m, FORMATIONS, [])
		expect((await profilStocke(m.payload, m.compte)).formations ?? []).toHaveLength(0)
	})
})

describe('131 : les prestations', () => {
	test.each(['80', '80 €', 'à partir de 80'])('U29 : « %s » donne un prix de 80, le texte est gardé', async saisie => {
		const m = await maquilleuse()
		const resultat = await enregistrer(m, PRESTATIONS, [{ valeurs: { nom: 'Mariée', description: '', prix: saisie } }])

		expect(resultat.ok && resultat.valeurs.lignes[0]?.valeurs.prix).toBe(saisie)
		expect((await profilStocke(m.payload, m.compte)).prestations?.[0]).toMatchObject({
			nom: 'Mariée',
			prixAPartirDe: 80,
			prixTexte: saisie,
		})
	})

	test('U29 : « sur devis » garde son texte sans montant, plusieurs formules sont rangées une par ligne', async () => {
		const m = await maquilleuse()
		await enregistrer(m, PRESTATIONS, [
			{ valeurs: { nom: 'Mariée', description: '', prix: 'sur devis' } },
			{ valeurs: { nom: 'Cours', description: 'Deux heures.', prix: '60 € ; sur devis' } },
		])
		const [devis, cours] = (await profilStocke(m.payload, m.compte)).prestations ?? []
		expect(devis).toMatchObject({ prixAPartirDe: null, prixTexte: 'sur devis' })
		expect(cours).toMatchObject({ prixAPartirDe: 60, prixTexte: '60 €\nsur devis', description: 'Deux heures.' })
	})

	test('un montant envoyé par la requête refuse la requête entière : le serveur le lit lui-même', async () => {
		const m = await maquilleuse()
		const resultat = await enregistrerListe(
			m.payload,
			m.utilisateur,
			{ lignes: [{ valeurs: { nom: 'Mariée', description: '', prix: 'sur devis', prixAPartirDe: 5000 } }] },
			PRESTATIONS
		)
		expect(resultat).toEqual({ ok: false, message: MESSAGE_ECHEC })
		expect((await profilStocke(m.payload, m.compte)).prestations ?? []).toHaveLength(0)
	})

	test('les options d’une prestation sont gardées quand on change la prestation, avec leurs identifiants', async () => {
		const m = await maquilleuse()
		await m.payload.update({
			collection: 'profiles',
			id: m.id,
			data: {
				prestations: [
					{
						nom: 'Mariée',
						prixTexte: '80',
						prixAPartirDe: 80,
						options: [
							{ nom: 'Essai', prixTexte: '30', prixAPartirDe: 30 },
							{ nom: 'Cils', prixTexte: 'sur devis' },
						],
					},
				],
			},
		})
		const avant = (await profilStocke(m.payload, m.compte)).prestations?.[0]
		const idsAvant = avant?.options?.map(option => option.id)
		expect(idsAvant).toHaveLength(2)

		const resultat = await enregistrer(m, PRESTATIONS, [
			{ id: avant?.id ?? undefined, valeurs: { nom: 'Mariée du soir', description: '', prix: '90' } },
		])

		expect(resultat.ok && resultat.valeurs.lignes[0]?.valeurs.nom).toBe('Mariée du soir')
		const apres = (await profilStocke(m.payload, m.compte)).prestations?.[0]
		expect(apres).toMatchObject({ nom: 'Mariée du soir', prixAPartirDe: 90 })
		expect(apres?.options?.map(option => [option.id, option.nom, option.prixAPartirDe ?? null])).toEqual([
			[idsAvant?.[0], 'Essai', 30],
			[idsAvant?.[1], 'Cils', null],
		])
	})

	test('E31 : un nom trop long ou vide est refusé, la base ne bouge pas', async () => {
		const m = await maquilleuse()
		await enregistrer(m, PRESTATIONS, [{ valeurs: { nom: 'Mariée', description: '', prix: '80' } }])
		const avant = await profilStocke(m.payload, m.compte)

		const vide = await enregistrer(m, PRESTATIONS, [{ valeurs: { nom: '', description: '', prix: '80' } }])
		const long = await enregistrer(m, PRESTATIONS, [{ valeurs: { nom: 'a'.repeat(71), description: '', prix: '80' } }])

		expect(vide).toMatchObject({ ok: false })
		expect(long).toMatchObject({ ok: false })
		expect((await profilStocke(m.payload, m.compte)).updatedAt).toBe(avant.updatedAt)
	})

	describe('U04 : une prestation chiffrée remplit le critère « publiable »', () => {
		async function toutSaufLOffre() {
			const m = await maquilleuse()
			const photo = await m.payload.create({
				collection: 'media',
				data: { owner: Number(m.compte.id) },
				file: fichierPourPayload(),
			})
			await m.payload.update({
				collection: 'profiles',
				id: m.id,
				data: {
					mainPicture: photo.id,
					city: ANNECY,
					specialty: 'Mariage',
					networks: { instagram: 'https://www.instagram.com/studio.fictif' },
					description: 'Maquilleuse fictive, pour les essais du banc. '.repeat(5),
				},
			})
			return m
		}
		const publiable = async (m: Awaited<ReturnType<typeof maquilleuse>>) =>
			(await profilStocke(m.payload, m.compte)).publishable

		test('« sur devis » seul ne suffit pas, un montant suffit, et le retirer ôte le critère', async () => {
			const m = await toutSaufLOffre()

			await enregistrer(m, PRESTATIONS, [{ valeurs: { nom: 'Mariée', description: '', prix: 'sur devis' } }])
			expect(await publiable(m)).toBe(false)

			const chiffree = await enregistrer(m, PRESTATIONS, [
				{ valeurs: { nom: 'Mariée', description: '', prix: 'à partir de 80' } },
			])
			expect(chiffree.ok).toBe(true)
			expect(await publiable(m)).toBe(true)

			await enregistrer(m, PRESTATIONS, [])
			expect(await publiable(m)).toBe(false)
		})
	})
})

describe('132 : les options d’une prestation', () => {
	const MARIEE: ValeursDeLigne = { nom: 'Mariée', description: '', prix: '80' }
	const SOIREE: ValeursDeLigne = { nom: 'Soirée', description: '', prix: '60' }
	const ESSAI: ValeursDeLigne = { nom: 'Essai', description: 'Une heure', prix: '30' }
	const CILS: ValeursDeLigne = { nom: 'Cils', description: '', prix: 'sur devis' }
	const RETOUCHES: ValeursDeLigne = { nom: 'Retouches', description: '', prix: '' }

	test('les options sont stockées sous la bonne prestation, dans l’ordre, avec le montant lu par le serveur', async () => {
		const m = await maquilleuse()
		const resultat = await enregistrer(m, PRESTATIONS, [
			{ valeurs: MARIEE, options: [{ valeurs: ESSAI }, { valeurs: CILS }] },
			{ valeurs: SOIREE, options: [{ valeurs: RETOUCHES }] },
		])
		expect(resultat.ok).toBe(true)
		const stockees = (await profilStocke(m.payload, m.compte)).prestations ?? []
		expect(
			stockees.map(p => [p.nom, p.options?.map(o => [o.nom, o.prixAPartirDe ?? null, o.prixTexte ?? null])])
		).toEqual([
			[
				'Mariée',
				[
					['Essai', 30, '30'],
					['Cils', null, 'sur devis'],
				],
			],
			['Soirée', [['Retouches', null, null]]],
		])
		// Given back with an identifier each, in order, for the next save.
		const donnees = resultat.ok ? resultat.valeurs.lignes : []
		expect(donnees.map(l => l.options?.map(o => o.valeurs.nom))).toEqual([['Essai', 'Cils'], ['Retouches']])
		expect(new Set(donnees.flatMap(l => l.options?.map(o => o.id) ?? [])).size).toBe(3)
	})

	test('L1 : une option renvoyée avec son identifiant le garde, une option ajoutée en reçoit un, l’ordre suit la requête', async () => {
		const m = await maquilleuse()
		const premiere = await enregistrer(m, PRESTATIONS, [
			{ valeurs: MARIEE, options: [{ valeurs: ESSAI }, { valeurs: CILS }] },
		])
		const [ligne] = premiere.ok ? premiere.valeurs.lignes : []
		const [essai, cils] = ligne?.options ?? []

		const seconde = await enregistrer(m, PRESTATIONS, [
			{
				id: ligne?.id,
				valeurs: MARIEE,
				options: [{ id: cils?.id, valeurs: CILS }, { valeurs: RETOUCHES }, { id: essai?.id, valeurs: ESSAI }],
			},
		])
		const options = seconde.ok ? (seconde.valeurs.lignes[0]?.options ?? []) : []
		expect(options.map(o => o.valeurs.nom)).toEqual(['Cils', 'Retouches', 'Essai'])
		expect(options[0]?.id).toBe(cils?.id ?? 'x')
		expect(options[2]?.id).toBe(essai?.id ?? 'x')
		expect(options[1]?.id).not.toBe(essai?.id)
		expect(options[1]?.id).not.toBe(cils?.id)
	})

	test('retirer la dernière option la retire du stockage ; ne rien envoyer les garde', async () => {
		const m = await maquilleuse()
		const premiere = await enregistrer(m, PRESTATIONS, [{ valeurs: MARIEE, options: [{ valeurs: ESSAI }] }])
		const id = premiere.ok ? premiere.valeurs.lignes[0]?.id : undefined

		await enregistrer(m, PRESTATIONS, [{ id, valeurs: MARIEE }])
		expect((await profilStocke(m.payload, m.compte)).prestations?.[0]?.options).toHaveLength(1)

		await enregistrer(m, PRESTATIONS, [{ id, valeurs: MARIEE, options: [] }])
		expect((await profilStocke(m.payload, m.compte)).prestations?.[0]?.options ?? []).toHaveLength(0)
	})

	test('un identifiant d’option qui n’est pas celui de cette prestation est remplacé, jamais repris', async () => {
		const m = await maquilleuse()
		const premiere = await enregistrer(m, PRESTATIONS, [
			{ valeurs: MARIEE, options: [{ valeurs: ESSAI }] },
			{ valeurs: SOIREE, options: [{ valeurs: CILS }] },
		])
		const [une, autre] = premiere.ok ? premiere.valeurs.lignes : []
		const idDeLAutre = autre?.options?.[0]?.id
		const resultat = await enregistrer(m, PRESTATIONS, [
			{ id: une?.id, valeurs: MARIEE, options: [{ id: idDeLAutre, valeurs: CILS }] },
			{ id: autre?.id, valeurs: SOIREE, options: [{ id: idDeLAutre, valeurs: CILS }] },
		])
		const options = resultat.ok ? resultat.valeurs.lignes.map(l => l.options?.[0]?.id) : []
		expect(options[1]).toBe(idDeLAutre ?? 'x')
		expect(options[0]).not.toBe(idDeLAutre)
	})

	test('L6 : deux options identiques sont refusées, la base ne bouge pas', async () => {
		const m = await maquilleuse()
		await enregistrer(m, PRESTATIONS, [{ valeurs: MARIEE, options: [{ valeurs: ESSAI }] }])
		const avant = await profilStocke(m.payload, m.compte)
		const resultat = await enregistrer(m, PRESTATIONS, [
			{ valeurs: MARIEE, options: [{ valeurs: ESSAI }, { valeurs: { ...ESSAI, nom: ' Essai ' } }] },
		])
		expect(resultat).toMatchObject({ ok: false, message: expect.stringContaining('deux options identiques') })
		expect((await profilStocke(m.payload, m.compte)).prestations).toEqual(avant.prestations)
	})

	test('E31 : une option sans nom, ou trop longue, est refusée avec son nom dans le message', async () => {
		const m = await maquilleuse()
		const vide = await enregistrer(m, PRESTATIONS, [{ valeurs: MARIEE, options: [{ valeurs: { ...ESSAI, nom: '' } }] }])
		const longue = await enregistrer(m, PRESTATIONS, [
			{ valeurs: MARIEE, options: [{ valeurs: { ...ESSAI, prix: 'a'.repeat(71) } }] },
		])
		expect(vide).toMatchObject({ ok: false, message: expect.stringContaining('Le nom de l’option est requis.') })
		expect(longue).toMatchObject({ ok: false, message: expect.stringContaining('« Essai »') })
		expect((await profilStocke(m.payload, m.compte)).prestations ?? []).toHaveLength(0)
	})

	test('une requête qui porte un montant d’option, ou des options hors prestation, est refusée en entier', async () => {
		const m = await maquilleuse()
		const montant = await enregistrer(m, PRESTATIONS, [
			{ valeurs: MARIEE, options: [{ valeurs: { ...ESSAI, prixAPartirDe: '30' } as ValeursDeLigne }] },
		])
		const horsPrestation = await enregistrer(m, EXPERIENCES, [{ valeurs: EXPERIENCE, options: [{ valeurs: ESSAI }] }])
		expect(montant).toEqual({ ok: false, message: MESSAGE_ECHEC })
		expect(horsPrestation).toEqual({ ok: false, message: MESSAGE_ECHEC })
	})
})
