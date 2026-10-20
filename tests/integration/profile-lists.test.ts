import { afterEach, describe, expect, test } from 'bun:test'
import type { Profile } from '@/payload-types'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'

/**
 * The list sections of a profile (ticket 040): offers with their options, skills, languages,
 * courses and experiences keep their order and the identifier of each row from one save to the
 * next, and the server refuses a value out of bounds, in French. Saved as the artist will save
 * them: by REST with her session, and by the Local API with the rules active.
 */

afterEach(emptyBase)

type Listes = Pick<Profile, 'serviceOffers' | 'skills' | 'languages' | 'courses' | 'experiences'>

/** Identifiers as Payload gives them to a row. */
const IDENTIFIANT = /^[0-9a-f]{24}$/

/** A makeup artist with her empty profile and her session. */
async function maquilleuse() {
	const compte = await createAccount('maquilleuse')
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } })
	const profil = docs[0]
	if (!profil) throw new Error('La fabrique devait créer le profil de la maquilleuse.')
	return { compte, profil: profil.id }
}

type Maquilleuse = Awaited<ReturnType<typeof maquilleuse>>

/** Her profile as she reads it, by REST. */
async function lire({ compte, profil }: Maquilleuse): Promise<Profile> {
	const { statut, corps } = await callRest('GET', `/api/profiles/${profil}?depth=0`, {
		enTetes: compte.session.enTetes,
	})
	expect(statut).toBe(200)
	return corps as Profile
}

/** A save of her profile, by REST, as her space will send it. */
const enregistrer = ({ compte, profil }: Maquilleuse, donnees: Partial<Profile>) =>
	callRest('PATCH', `/api/profiles/${profil}?depth=0`, { enTetes: compte.session.enTetes, corps: donnees })

/** The profile as stored, read without access control. */
const stocke = async (profil: number) =>
	(await testPayload()).findByID({ collection: 'profiles', id: profil, depth: 0 })

/** The refusals of a REST answer: where, and what the artist reads. */
function refus(corps: unknown): { path: string; message: string }[] {
	const erreurs = (corps as { errors?: { data?: { errors?: { path: string; message: string }[] } }[] }).errors ?? []
	return erreurs.flatMap(({ data }) => (data?.errors ?? []).map(({ path, message }) => ({ path, message })))
}

const identifiants = (lignes: readonly { id?: string | null }[] | null | undefined) =>
	(lignes ?? []).map(({ id }) => id)

/** Three offers, the second with two options, in an order no sort would give. */
const TROIS_PRESTATIONS: NonNullable<Profile['serviceOffers']> = [
	{ name: 'Mariée', description: 'Essai compris.', priceText: 'à partir de 180 €', priceFrom: 180 },
	{
		name: 'Soirée',
		priceText: '80',
		priceFrom: 80,
		options: [
			{ name: 'Faux cils', priceText: '15 €', priceFrom: 15 },
			{ name: 'Déplacement', priceText: 'Sur devis', priceFrom: null },
		],
	},
	{ name: 'Cours d’auto-maquillage', priceText: 'Sur devis', priceFrom: null },
]

describe('Les sections en liste gardent leur ordre et l’identité de chaque ligne', () => {
	test('3 prestations dont une à 2 options : même ordre et mêmes identifiants après deux sauvegardes', async () => {
		const a = await maquilleuse()

		expect((await enregistrer(a, { serviceOffers: TROIS_PRESTATIONS })).statut).toBe(200)
		const premiere = (await lire(a)).serviceOffers ?? []

		expect(premiere.map(({ name }) => name)).toEqual(['Mariée', 'Soirée', 'Cours d’auto-maquillage'])
		expect(premiere[1]?.options?.map(({ name }) => name)).toEqual(['Faux cils', 'Déplacement'])
		const tous = [...identifiants(premiere), ...identifiants(premiere[1]?.options)]
		for (const id of tous) expect(id).toMatch(IDENTIFIANT)
		expect(new Set(tous).size).toBe(5)

		// First save: the list sent back as read. Second save: another field only.
		expect((await enregistrer(a, { serviceOffers: premiere })).statut).toBe(200)
		expect((await lire(a)).serviceOffers).toEqual(premiere)
		expect((await enregistrer(a, { firstName: 'Zoé' })).statut).toBe(200)
		expect((await lire(a)).serviceOffers).toEqual(premiere)
	})

	test('les cinq listes gardent leurs lignes, leur ordre et leurs identifiants, par REST puis par l’API locale', async () => {
		const a = await maquilleuse()
		const listes: Listes = {
			serviceOffers: TROIS_PRESTATIONS,
			skills: [{ name: 'Mariage', description: 'Depuis 2015.' }, { name: 'Effets spéciaux' }],
			languages: [{ name: 'Italien' }, { name: 'Anglais' }, { name: 'Espagnol' }],
			courses: [
				{
					diploma: 'CAP Esthétique',
					school: 'École fictive',
					graduatedAt: '2012-06-30',
					description: 'Option maquillage.',
				},
			],
			experiences: [
				{
					company: 'Théâtre fictif',
					jobTitle: 'Maquilleuse',
					city: 'Annecy',
					startDate: '2018-09-01',
					endDate: '2020-06-30',
				},
				{ company: 'Studio fictif', jobTitle: 'Cheffe maquilleuse', startDate: '2020-07-01', endDate: null },
			],
		}

		expect((await enregistrer(a, listes)).statut).toBe(200)
		const lu = await lire(a)

		expect(lu).toMatchObject({
			skills: [
				{ name: 'Mariage', description: 'Depuis 2015.' },
				{ name: 'Effets spéciaux', description: null },
			],
			languages: [{ name: 'Italien' }, { name: 'Anglais' }, { name: 'Espagnol' }],
			// A day without an hour, stored at noon UTC: the same day in every time zone of France.
			courses: [{ diploma: 'CAP Esthétique', graduatedAt: '2012-06-30T12:00:00.000Z' }],
			experiences: [
				{
					company: 'Théâtre fictif',
					city: 'Annecy',
					startDate: '2018-09-01T12:00:00.000Z',
					endDate: '2020-06-30T12:00:00.000Z',
				},
				{ company: 'Studio fictif', city: null, startDate: '2020-07-01T12:00:00.000Z', endDate: null },
			],
		})
		const relues: Listes = {
			serviceOffers: lu.serviceOffers,
			skills: lu.skills,
			languages: lu.languages,
			courses: lu.courses,
			experiences: lu.experiences,
		}

		const payload = await testPayload()
		const utilisateur = {
			...(await payload.findByID({ collection: 'pros', id: Number(a.compte.id) })),
			collection: 'pros',
		}
		await payload.update({
			collection: 'profiles',
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
			serviceOffers: TROIS_PRESTATIONS,
			languages: [{ name: 'Italien' }, { name: 'Anglais' }, { name: 'Espagnol' }],
		})
		const avant = await lire(a)
		const [mariee, soiree, cours] = avant.serviceOffers ?? []
		const [italien, anglais, espagnol] = avant.languages ?? []
		if (!mariee || !soiree || !cours || !italien || !anglais || !espagnol) throw new Error('Lignes attendues.')
		const [, deplacement] = soiree.options ?? []

		// The middle offer goes, and so does the first option of « Soirée »; the first language goes.
		expect(
			(
				await enregistrer(a, {
					serviceOffers: [mariee, { ...soiree, options: deplacement ? [deplacement] : [] }, cours],
					languages: [anglais, espagnol],
				})
			).statut
		).toBe(200)
		expect((await enregistrer(a, { serviceOffers: [mariee, cours] })).statut).toBe(200)

		const apres = await lire(a)
		expect(apres.serviceOffers).toEqual([mariee, cours])
		expect(apres.languages).toEqual([anglais, espagnol])
	})

	test('L1. deux lignes de même contenu ont chacune leur identifiant : retirer l’une laisse l’autre', async () => {
		const a = await maquilleuse()
		await enregistrer(a, { languages: [{ name: 'Anglais' }, { name: 'Anglais' }] })
		const [premiere, seconde] = (await lire(a)).languages ?? []
		expect(premiere?.id).not.toBe(seconde?.id)

		await enregistrer(a, { languages: seconde ? [seconde] : [] })

		expect((await lire(a)).languages).toEqual(seconde ? [seconde] : [])
	})

	test('L1. un identifiant tiré du contenu, copié d’une autre ligne ou pris à un autre profil n’est pas repris', async () => {
		const [a, b] = await Promise.all([maquilleuse(), maquilleuse()])
		await enregistrer(a, { languages: [{ name: 'Anglais' }] })
		const [anglaisDeA] = (await lire(a)).languages ?? []
		if (!anglaisDeA?.id) throw new Error('Ligne attendue.')

		const deB = await enregistrer(b, {
			languages: [
				{ id: anglaisDeA.id, name: 'Anglais' },
				{ id: 'italien', name: 'Italien' },
			],
		})
		expect(deB.statut).toBe(200)
		const [anglaisDeB, italienDeB] = (await lire(b)).languages ?? []
		for (const ligne of [anglaisDeB, italienDeB]) expect(ligne?.id).toMatch(IDENTIFIANT)
		expect(anglaisDeB?.id).not.toBe(anglaisDeA.id)
		expect((await lire(a)).languages).toEqual([anglaisDeA])

		// The same row twice in one save: the copy becomes a new row.
		await enregistrer(a, { languages: [anglaisDeA, anglaisDeA] })
		const [garde, copie] = (await lire(a)).languages ?? []
		expect(garde).toEqual(anglaisDeA)
		expect(copie?.id).toMatch(IDENTIFIANT)
		expect(copie?.id).not.toBe(anglaisDeA.id)
	})

	test('une autre maquilleuse ne touche pas aux listes d’un profil qui n’est pas le sien', async () => {
		const [a, b] = await Promise.all([maquilleuse(), maquilleuse()])
		await enregistrer(a, { languages: [{ name: 'Anglais' }] })
		const avant = (await stocke(a.profil)).languages

		const essai = await callRest('PATCH', `/api/profiles/${a.profil}`, {
			enTetes: b.compte.session.enTetes,
			corps: { languages: [] },
		})

		expect([403, 404]).toContain(essai.statut)
		expect((await stocke(a.profil)).languages).toEqual(avant)
	})
})

describe('Le serveur valide les bornes, et refuse en français', () => {
	test('un prix négatif est refusé en français, pour une prestation comme pour une option ; rien n’est écrit', async () => {
		const a = await maquilleuse()
		await enregistrer(a, { serviceOffers: TROIS_PRESTATIONS })
		const avant = (await stocke(a.profil)).serviceOffers

		const prestation = await enregistrer(a, { serviceOffers: [{ name: 'Mariée', priceText: '-50', priceFrom: -50 }] })
		const option = await enregistrer(a, {
			serviceOffers: [{ name: 'Soirée', options: [{ name: 'Faux cils', priceFrom: -15 }] }],
		})

		const message = 'Le prix doit être un montant entre 5 € et 10 000 €.'
		expect(prestation.statut).toBe(400)
		expect(refus(prestation.corps)).toEqual([{ path: 'serviceOffers.0.priceFrom', message }])
		expect(option.statut).toBe(400)
		expect(refus(option.corps)).toEqual([{ path: 'serviceOffers.0.options.0.priceFrom', message }])
		expect((await stocke(a.profil)).serviceOffers).toEqual(avant)
	})

	test('un prix vide avec un texte libre est accepté', async () => {
		const a = await maquilleuse()

		const reponse = await enregistrer(a, {
			serviceOffers: [{ name: 'Maquillage artistique', priceText: 'Sur devis, selon le projet', priceFrom: null }],
		})

		expect(reponse.statut).toBe(200)
		expect((await lire(a)).serviceOffers).toMatchObject([
			{ name: 'Maquillage artistique', priceText: 'Sur devis, selon le projet', priceFrom: null },
		])
	})

	test('la fin d’une expérience avant son début est refusée, en français ; le même jour passe', async () => {
		const a = await maquilleuse()

		const avantLeDebut = await enregistrer(a, {
			experiences: [{ company: 'Studio fictif', startDate: '2023-06-01', endDate: '2023-05-31' }],
		})
		const leMemeJour = await enregistrer(a, {
			experiences: [
				{ company: 'Studio fictif', startDate: '2023-06-01T20:00:00+02:00', endDate: '2023-06-01T08:00:00+02:00' },
			],
		})

		expect(avantLeDebut.statut).toBe(400)
		expect(refus(avantLeDebut.corps)).toEqual([
			{ path: 'experiences.0.endDate', message: 'La fin d’une expérience ne peut pas précéder son début.' },
		])
		expect(leMemeJour.statut).toBe(200)
		expect((await lire(a)).experiences).toMatchObject([
			{ startDate: '2023-06-01T12:00:00.000Z', endDate: '2023-06-01T12:00:00.000Z' },
		])
	})

	test('un texte trop long, une date qui n’existe pas ou une formation à plus d’un an sont refusés, en français', async () => {
		const a = await maquilleuse()
		const dansDeuxAns = `${new Date().getUTCFullYear() + 2}-01-15`

		const reponse = await enregistrer(a, {
			skills: [{ name: 'a'.repeat(71) }],
			languages: [{ name: 'a'.repeat(70) }],
			serviceOffers: [{ name: 'Mariée', description: 'a'.repeat(2001) }],
			experiences: [{ company: 'Studio fictif', startDate: '2023-02-30' }],
			courses: [{ diploma: 'CAP Esthétique', graduatedAt: dansDeuxAns }],
		})

		expect(reponse.statut).toBe(400)
		expect(refus(reponse.corps).sort((x, y) => x.path.localeCompare(y.path))).toEqual([
			{ path: 'courses.0.graduatedAt', message: 'Une date d’obtention ne peut pas dépasser d’un an la date du jour.' },
			{ path: 'experiences.0.startDate', message: 'Cette date n’est pas valide.' },
			{ path: 'serviceOffers.0.description', message: 'Ce texte ne doit pas dépasser 2000 caractères.' },
			{ path: 'skills.0.name', message: 'Ce texte ne doit pas dépasser 70 caractères.' },
		])
	})

	test('une date de l’an 0, que PostgreSQL ne stocke pas, est refusée en 400 et non en 500 (ticket 224)', async () => {
		const a = await maquilleuse()

		const reponse = await enregistrer(a, {
			experiences: [{ company: 'Studio fictif', startDate: '0000-01-01' }],
			courses: [{ diploma: 'CAP Esthétique', graduatedAt: '0000-12-31T00:00:00.000Z' }],
		})

		expect(reponse.statut).toBe(400)
		expect(refus(reponse.corps).sort((x, y) => x.path.localeCompare(y.path))).toEqual([
			{ path: 'courses.0.graduatedAt', message: 'Cette date n’est pas valide.' },
			{ path: 'experiences.0.startDate', message: 'Cette date n’est pas valide.' },
		])
		expect((await stocke(a.profil)).experiences ?? []).toEqual([])
	})

	test('une sauvegarde refusée ne vide aucune section déjà enregistrée', async () => {
		const a = await maquilleuse()
		await enregistrer(a, { serviceOffers: TROIS_PRESTATIONS, languages: [{ name: 'Anglais' }] })
		const avant = await stocke(a.profil)

		const reponse = await enregistrer(a, {
			serviceOffers: [{ name: 'Nouvelle' }],
			languages: [],
			experiences: [{ company: 'Studio fictif', startDate: '2023-06-01', endDate: '2022-01-01' }],
		})

		expect(reponse.statut).toBe(400)
		const apres = await stocke(a.profil)
		expect([apres.serviceOffers, apres.languages]).toEqual([avant.serviceOffers, avant.languages])
	})
})
