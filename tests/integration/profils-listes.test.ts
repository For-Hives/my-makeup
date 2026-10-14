import { afterEach, describe, expect, test } from 'bun:test'
import type { Profil } from '@/payload-types'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest } from '../outils/rest'

/**
 * The list sections of a profile (ticket 040): offers with their options, skills, languages,
 * courses and experiences keep their order and the identifier of each row from one save to the
 * next, and the server refuses a value out of bounds, in French. Saved as the artist will save
 * them: by REST with her session, and by the Local API with the rules active.
 */

afterEach(viderLaBase)

type Listes = Pick<Profil, 'prestations' | 'competences' | 'langues' | 'formations' | 'experiences'>

/** Identifiers as Payload gives them to a row. */
const IDENTIFIANT = /^[0-9a-f]{24}$/

/** A makeup artist with her empty profile and her session. */
async function maquilleuse() {
	const compte = await creerCompte('maquilleuse')
	const payload = await payloadDeTest()
	const { docs } = await payload.find({ collection: 'profils', depth: 0, where: { pro: { equals: compte.id } } })
	const profil = docs[0]
	if (!profil) throw new Error('La fabrique devait créer le profil de la maquilleuse.')
	return { compte, profil: profil.id }
}

type Maquilleuse = Awaited<ReturnType<typeof maquilleuse>>

/** Her profile as she reads it, by REST. */
async function lire({ compte, profil }: Maquilleuse): Promise<Profil> {
	const { statut, corps } = await appelerRest('GET', `/api/profils/${profil}?depth=0`, {
		enTetes: compte.session.enTetes,
	})
	expect(statut).toBe(200)
	return corps as Profil
}

/** A save of her profile, by REST, as her space will send it. */
const enregistrer = ({ compte, profil }: Maquilleuse, donnees: Partial<Profil>) =>
	appelerRest('PATCH', `/api/profils/${profil}?depth=0`, { enTetes: compte.session.enTetes, corps: donnees })

/** The profile as stored, read without access control. */
const stocke = async (profil: number) =>
	(await payloadDeTest()).findByID({ collection: 'profils', id: profil, depth: 0 })

/** The refusals of a REST answer: where, and what the artist reads. */
function refus(corps: unknown): { path: string; message: string }[] {
	const erreurs = (corps as { errors?: { data?: { errors?: { path: string; message: string }[] } }[] }).errors ?? []
	return erreurs.flatMap(({ data }) => (data?.errors ?? []).map(({ path, message }) => ({ path, message })))
}

const identifiants = (lignes: readonly { id?: string | null }[] | null | undefined) =>
	(lignes ?? []).map(({ id }) => id)

/** Three offers, the second with two options, in an order no sort would give. */
const TROIS_PRESTATIONS: NonNullable<Profil['prestations']> = [
	{ nom: 'Mariée', description: 'Essai compris.', prixTexte: 'à partir de 180 €', prixAPartirDe: 180 },
	{
		nom: 'Soirée',
		prixTexte: '80',
		prixAPartirDe: 80,
		options: [
			{ nom: 'Faux cils', prixTexte: '15 €', prixAPartirDe: 15 },
			{ nom: 'Déplacement', prixTexte: 'Sur devis', prixAPartirDe: null },
		],
	},
	{ nom: 'Cours d’auto-maquillage', prixTexte: 'Sur devis', prixAPartirDe: null },
]

describe('Les sections en liste gardent leur ordre et l’identité de chaque ligne', () => {
	test('3 prestations dont une à 2 options : même ordre et mêmes identifiants après deux sauvegardes', async () => {
		const a = await maquilleuse()

		expect((await enregistrer(a, { prestations: TROIS_PRESTATIONS })).statut).toBe(200)
		const premiere = (await lire(a)).prestations ?? []

		expect(premiere.map(({ nom }) => nom)).toEqual(['Mariée', 'Soirée', 'Cours d’auto-maquillage'])
		expect(premiere[1]?.options?.map(({ nom }) => nom)).toEqual(['Faux cils', 'Déplacement'])
		const tous = [...identifiants(premiere), ...identifiants(premiere[1]?.options)]
		for (const id of tous) expect(id).toMatch(IDENTIFIANT)
		expect(new Set(tous).size).toBe(5)

		// First save: the list sent back as read. Second save: another field only.
		expect((await enregistrer(a, { prestations: premiere })).statut).toBe(200)
		expect((await lire(a)).prestations).toEqual(premiere)
		expect((await enregistrer(a, { prenom: 'Zoé' })).statut).toBe(200)
		expect((await lire(a)).prestations).toEqual(premiere)
	})

	test('les cinq listes gardent leurs lignes, leur ordre et leurs identifiants, par REST puis par l’API locale', async () => {
		const a = await maquilleuse()
		const listes: Listes = {
			prestations: TROIS_PRESTATIONS,
			competences: [{ nom: 'Mariage', description: 'Depuis 2015.' }, { nom: 'Effets spéciaux' }],
			langues: [{ nom: 'Italien' }, { nom: 'Anglais' }, { nom: 'Espagnol' }],
			formations: [
				{
					diplome: 'CAP Esthétique',
					ecole: 'École fictive',
					obtenuLe: '2012-06-30',
					description: 'Option maquillage.',
				},
			],
			experiences: [
				{ entreprise: 'Théâtre fictif', poste: 'Maquilleuse', ville: 'Annecy', debut: '2018-09-01', fin: '2020-06-30' },
				{ entreprise: 'Studio fictif', poste: 'Cheffe maquilleuse', debut: '2020-07-01', fin: null },
			],
		}

		expect((await enregistrer(a, listes)).statut).toBe(200)
		const lu = await lire(a)

		expect(lu).toMatchObject({
			competences: [
				{ nom: 'Mariage', description: 'Depuis 2015.' },
				{ nom: 'Effets spéciaux', description: null },
			],
			langues: [{ nom: 'Italien' }, { nom: 'Anglais' }, { nom: 'Espagnol' }],
			// A day without an hour, stored at noon UTC: the same day in every time zone of France.
			formations: [{ diplome: 'CAP Esthétique', obtenuLe: '2012-06-30T12:00:00.000Z' }],
			experiences: [
				{
					entreprise: 'Théâtre fictif',
					ville: 'Annecy',
					debut: '2018-09-01T12:00:00.000Z',
					fin: '2020-06-30T12:00:00.000Z',
				},
				{ entreprise: 'Studio fictif', ville: null, debut: '2020-07-01T12:00:00.000Z', fin: null },
			],
		})
		const relues: Listes = {
			prestations: lu.prestations,
			competences: lu.competences,
			langues: lu.langues,
			formations: lu.formations,
			experiences: lu.experiences,
		}

		const payload = await payloadDeTest()
		const utilisateur = {
			...(await payload.findByID({ collection: 'pros', id: Number(a.compte.id) })),
			collection: 'pros',
		}
		await payload.update({
			collection: 'profils',
			id: a.profil,
			data: relues,
			overrideAccess: false,
			user: utilisateur,
		})

		expect(await lire(a)).toMatchObject(relues)
	})

	test('retirer une ligne ne décale aucun identifiant', async () => {
		const a = await maquilleuse()
		await enregistrer(a, {
			prestations: TROIS_PRESTATIONS,
			langues: [{ nom: 'Italien' }, { nom: 'Anglais' }, { nom: 'Espagnol' }],
		})
		const avant = await lire(a)
		const [mariee, soiree, cours] = avant.prestations ?? []
		const [italien, anglais, espagnol] = avant.langues ?? []
		if (!mariee || !soiree || !cours || !italien || !anglais || !espagnol) throw new Error('Lignes attendues.')
		const [, deplacement] = soiree.options ?? []

		// The middle offer goes, and so does the first option of « Soirée »; the first language goes.
		expect(
			(
				await enregistrer(a, {
					prestations: [mariee, { ...soiree, options: deplacement ? [deplacement] : [] }, cours],
					langues: [anglais, espagnol],
				})
			).statut
		).toBe(200)
		expect((await enregistrer(a, { prestations: [mariee, cours] })).statut).toBe(200)

		const apres = await lire(a)
		expect(apres.prestations).toEqual([mariee, cours])
		expect(apres.langues).toEqual([anglais, espagnol])
	})

	test('L1. deux lignes de même contenu ont chacune leur identifiant : retirer l’une laisse l’autre', async () => {
		const a = await maquilleuse()
		await enregistrer(a, { langues: [{ nom: 'Anglais' }, { nom: 'Anglais' }] })
		const [premiere, seconde] = (await lire(a)).langues ?? []
		expect(premiere?.id).not.toBe(seconde?.id)

		await enregistrer(a, { langues: seconde ? [seconde] : [] })

		expect((await lire(a)).langues).toEqual(seconde ? [seconde] : [])
	})

	test('L1. un identifiant tiré du contenu, copié d’une autre ligne ou pris à un autre profil n’est pas repris', async () => {
		const [a, b] = await Promise.all([maquilleuse(), maquilleuse()])
		await enregistrer(a, { langues: [{ nom: 'Anglais' }] })
		const [anglaisDeA] = (await lire(a)).langues ?? []
		if (!anglaisDeA?.id) throw new Error('Ligne attendue.')

		const deB = await enregistrer(b, {
			langues: [
				{ id: anglaisDeA.id, nom: 'Anglais' },
				{ id: 'italien', nom: 'Italien' },
			],
		})
		expect(deB.statut).toBe(200)
		const [anglaisDeB, italienDeB] = (await lire(b)).langues ?? []
		for (const ligne of [anglaisDeB, italienDeB]) expect(ligne?.id).toMatch(IDENTIFIANT)
		expect(anglaisDeB?.id).not.toBe(anglaisDeA.id)
		expect((await lire(a)).langues).toEqual([anglaisDeA])

		// The same row twice in one save: the copy becomes a new row.
		await enregistrer(a, { langues: [anglaisDeA, anglaisDeA] })
		const [garde, copie] = (await lire(a)).langues ?? []
		expect(garde).toEqual(anglaisDeA)
		expect(copie?.id).toMatch(IDENTIFIANT)
		expect(copie?.id).not.toBe(anglaisDeA.id)
	})

	test('une autre maquilleuse ne touche pas aux listes d’un profil qui n’est pas le sien', async () => {
		const [a, b] = await Promise.all([maquilleuse(), maquilleuse()])
		await enregistrer(a, { langues: [{ nom: 'Anglais' }] })
		const avant = (await stocke(a.profil)).langues

		const essai = await appelerRest('PATCH', `/api/profils/${a.profil}`, {
			enTetes: b.compte.session.enTetes,
			corps: { langues: [] },
		})

		expect([403, 404]).toContain(essai.statut)
		expect((await stocke(a.profil)).langues).toEqual(avant)
	})
})

describe('Le serveur valide les bornes, et refuse en français', () => {
	test('un prix négatif est refusé en français, pour une prestation comme pour une option ; rien n’est écrit', async () => {
		const a = await maquilleuse()
		await enregistrer(a, { prestations: TROIS_PRESTATIONS })
		const avant = (await stocke(a.profil)).prestations

		const prestation = await enregistrer(a, { prestations: [{ nom: 'Mariée', prixTexte: '-50', prixAPartirDe: -50 }] })
		const option = await enregistrer(a, {
			prestations: [{ nom: 'Soirée', options: [{ nom: 'Faux cils', prixAPartirDe: -15 }] }],
		})

		const message = 'Le prix doit être un montant entre 5 € et 10 000 €.'
		expect(prestation.statut).toBe(400)
		expect(refus(prestation.corps)).toEqual([{ path: 'prestations.0.prixAPartirDe', message }])
		expect(option.statut).toBe(400)
		expect(refus(option.corps)).toEqual([{ path: 'prestations.0.options.0.prixAPartirDe', message }])
		expect((await stocke(a.profil)).prestations).toEqual(avant)
	})

	test('un prix vide avec un texte libre est accepté', async () => {
		const a = await maquilleuse()

		const reponse = await enregistrer(a, {
			prestations: [{ nom: 'Maquillage artistique', prixTexte: 'Sur devis, selon le projet', prixAPartirDe: null }],
		})

		expect(reponse.statut).toBe(200)
		expect((await lire(a)).prestations).toMatchObject([
			{ nom: 'Maquillage artistique', prixTexte: 'Sur devis, selon le projet', prixAPartirDe: null },
		])
	})

	test('la fin d’une expérience avant son début est refusée, en français ; le même jour passe', async () => {
		const a = await maquilleuse()

		const avantLeDebut = await enregistrer(a, {
			experiences: [{ entreprise: 'Studio fictif', debut: '2023-06-01', fin: '2023-05-31' }],
		})
		const leMemeJour = await enregistrer(a, {
			experiences: [
				{ entreprise: 'Studio fictif', debut: '2023-06-01T20:00:00+02:00', fin: '2023-06-01T08:00:00+02:00' },
			],
		})

		expect(avantLeDebut.statut).toBe(400)
		expect(refus(avantLeDebut.corps)).toEqual([
			{ path: 'experiences.0.fin', message: 'La fin d’une expérience ne peut pas précéder son début.' },
		])
		expect(leMemeJour.statut).toBe(200)
		expect((await lire(a)).experiences).toMatchObject([
			{ debut: '2023-06-01T12:00:00.000Z', fin: '2023-06-01T12:00:00.000Z' },
		])
	})

	test('un texte trop long, une date qui n’existe pas ou une formation à plus d’un an sont refusés, en français', async () => {
		const a = await maquilleuse()
		const dansDeuxAns = `${new Date().getUTCFullYear() + 2}-01-15`

		const reponse = await enregistrer(a, {
			competences: [{ nom: 'a'.repeat(71) }],
			langues: [{ nom: 'a'.repeat(70) }],
			prestations: [{ nom: 'Mariée', description: 'a'.repeat(2001) }],
			experiences: [{ entreprise: 'Studio fictif', debut: '2023-02-30' }],
			formations: [{ diplome: 'CAP Esthétique', obtenuLe: dansDeuxAns }],
		})

		expect(reponse.statut).toBe(400)
		expect(refus(reponse.corps).sort((x, y) => x.path.localeCompare(y.path))).toEqual([
			{ path: 'competences.0.nom', message: 'Ce texte ne doit pas dépasser 70 caractères.' },
			{ path: 'experiences.0.debut', message: 'Cette date n’est pas valide.' },
			{ path: 'formations.0.obtenuLe', message: 'Une date d’obtention ne peut pas dépasser d’un an la date du jour.' },
			{ path: 'prestations.0.description', message: 'Ce texte ne doit pas dépasser 2000 caractères.' },
		])
	})

	test('une sauvegarde refusée ne vide aucune section déjà enregistrée', async () => {
		const a = await maquilleuse()
		await enregistrer(a, { prestations: TROIS_PRESTATIONS, langues: [{ nom: 'Anglais' }] })
		const avant = await stocke(a.profil)

		const reponse = await enregistrer(a, {
			prestations: [{ nom: 'Nouvelle' }],
			langues: [],
			experiences: [{ entreprise: 'Studio fictif', debut: '2023-06-01', fin: '2022-01-01' }],
		})

		expect(reponse.statut).toBe(400)
		const apres = await stocke(a.profil)
		expect([apres.prestations, apres.langues]).toEqual([avant.prestations, avant.langues])
	})
})
