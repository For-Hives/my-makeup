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

type Lists = Pick<Profile, 'serviceOffers' | 'skills' | 'languages' | 'courses' | 'experiences'>

/** Identifiers as Payload gives them to a row. */
const IDENTIFIER = /^[0-9a-f]{24}$/

/** A makeup artist with her empty profile and her session. */
async function artist() {
	const account = await createAccount('maquilleuse')
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
	const profile = docs[0]
	if (!profile) throw new Error('La fabrique devait créer le profil de la maquilleuse.')
	return { compte: account, profil: profile.id }
}

type Artist = Awaited<ReturnType<typeof artist>>

/** Her profile as she reads it, by REST. */
async function read({ compte: account, profil: profile }: Artist): Promise<Profile> {
	const { statut: status, corps } = await callRest('GET', `/api/profiles/${profile}?depth=0`, {
		enTetes: account.session.enTetes,
	})
	expect(status).toBe(200)
	return corps as Profile
}

/** A save of her profile, by REST, as her space will send it. */
const save = ({ compte: account, profil: profile }: Artist, donnees: Partial<Profile>) =>
	callRest('PATCH', `/api/profiles/${profile}?depth=0`, { enTetes: account.session.enTetes, corps: donnees })

/** The profile as stored, read without access control. */
const stored = async (profil: number) =>
	(await testPayload()).findByID({ collection: 'profiles', id: profil, depth: 0 })

/** The refusals of a REST answer: where, and what the artist reads. */
function refusal(corps: unknown): { path: string; message: string }[] {
	const errors = (corps as { errors?: { data?: { errors?: { path: string; message: string }[] } }[] }).errors ?? []
	return errors.flatMap(({ data }) => (data?.errors ?? []).map(({ path, message }) => ({ path, message })))
}

const identifiers = (lignes: readonly { id?: string | null }[] | null | undefined) => (lignes ?? []).map(({ id }) => id)

/** Three offers, the second with two options, in an order no sort would give. */
const THREE_SERVICE_OFFERS: NonNullable<Profile['serviceOffers']> = [
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
		const a = await artist()

		expect((await save(a, { serviceOffers: THREE_SERVICE_OFFERS })).statut).toBe(200)
		const first = (await read(a)).serviceOffers ?? []

		expect(first.map(({ name }) => name)).toEqual(['Mariée', 'Soirée', 'Cours d’auto-maquillage'])
		expect(first[1]?.options?.map(({ name }) => name)).toEqual(['Faux cils', 'Déplacement'])
		const all = [...identifiers(first), ...identifiers(first[1]?.options)]
		for (const id of all) expect(id).toMatch(IDENTIFIER)
		expect(new Set(all).size).toBe(5)

		// First save: the list sent back as read. Second save: another field only.
		expect((await save(a, { serviceOffers: first })).statut).toBe(200)
		expect((await read(a)).serviceOffers).toEqual(first)
		expect((await save(a, { firstName: 'Zoé' })).statut).toBe(200)
		expect((await read(a)).serviceOffers).toEqual(first)
	})

	test('les cinq listes gardent leurs lignes, leur ordre et leurs identifiants, par REST puis par l’API locale', async () => {
		const a = await artist()
		const lists: Lists = {
			serviceOffers: THREE_SERVICE_OFFERS,
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

		expect((await save(a, lists)).statut).toBe(200)
		const fetched = await read(a)

		expect(fetched).toMatchObject({
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
		const reread: Lists = {
			serviceOffers: fetched.serviceOffers,
			skills: fetched.skills,
			languages: fetched.languages,
			courses: fetched.courses,
			experiences: fetched.experiences,
		}

		const payload = await testPayload()
		const user = {
			...(await payload.findByID({ collection: 'pros', id: Number(a.compte.id) })),
			collection: 'pros',
		}
		await payload.update({
			collection: 'profiles',
			id: a.profil,
			data: reread,
			overrideAccess: false,
			user: user,
		})

		expect(await read(a)).toMatchObject(reread)
	})

	test('retirer une ligne ne décale aucun identifiant', async () => {
		const a = await artist()
		await save(a, {
			serviceOffers: THREE_SERVICE_OFFERS,
			languages: [{ name: 'Italien' }, { name: 'Anglais' }, { name: 'Espagnol' }],
		})
		const before = await read(a)
		const [bride, evening, ongoing] = before.serviceOffers ?? []
		const [italien, english, espagnol] = before.languages ?? []
		if (!bride || !evening || !ongoing || !italien || !english || !espagnol) throw new Error('Lignes attendues.')
		const [, move] = evening.options ?? []

		// The middle offer goes, and so does the first option of « Soirée »; the first language goes.
		expect(
			(
				await save(a, {
					serviceOffers: [bride, { ...evening, options: move ? [move] : [] }, ongoing],
					languages: [english, espagnol],
				})
			).statut
		).toBe(200)
		expect((await save(a, { serviceOffers: [bride, ongoing] })).statut).toBe(200)

		const after = await read(a)
		expect(after.serviceOffers).toEqual([bride, ongoing])
		expect(after.languages).toEqual([english, espagnol])
	})

	test('L1. deux lignes de même contenu ont chacune leur identifiant : retirer l’une laisse l’autre', async () => {
		const a = await artist()
		await save(a, { languages: [{ name: 'Anglais' }, { name: 'Anglais' }] })
		const [first, second] = (await read(a)).languages ?? []
		expect(first?.id).not.toBe(second?.id)

		await save(a, { languages: second ? [second] : [] })

		expect((await read(a)).languages).toEqual(second ? [second] : [])
	})

	test('L1. un identifiant tiré du contenu, copié d’une autre ligne ou pris à un autre profil n’est pas repris', async () => {
		const [a, b] = await Promise.all([artist(), artist()])
		await save(a, { languages: [{ name: 'Anglais' }] })
		const [englishOfA] = (await read(a)).languages ?? []
		if (!englishOfA?.id) throw new Error('Ligne attendue.')

		const ofB = await save(b, {
			languages: [
				{ id: englishOfA.id, name: 'Anglais' },
				{ id: 'italien', name: 'Italien' },
			],
		})
		expect(ofB.statut).toBe(200)
		const [englishOfB, italianOfB] = (await read(b)).languages ?? []
		for (const line of [englishOfB, italianOfB]) expect(line?.id).toMatch(IDENTIFIER)
		expect(englishOfB?.id).not.toBe(englishOfA.id)
		expect((await read(a)).languages).toEqual([englishOfA])

		// The same row twice in one save: the copy becomes a new row.
		await save(a, { languages: [englishOfA, englishOfA] })
		const [guard, copy] = (await read(a)).languages ?? []
		expect(guard).toEqual(englishOfA)
		expect(copy?.id).toMatch(IDENTIFIER)
		expect(copy?.id).not.toBe(englishOfA.id)
	})

	test('une autre maquilleuse ne touche pas aux listes d’un profil qui n’est pas le sien', async () => {
		const [a, b] = await Promise.all([artist(), artist()])
		await save(a, { languages: [{ name: 'Anglais' }] })
		const before = (await stored(a.profil)).languages

		const test = await callRest('PATCH', `/api/profiles/${a.profil}`, {
			enTetes: b.compte.session.enTetes,
			corps: { languages: [] },
		})

		expect([403, 404]).toContain(test.statut)
		expect((await stored(a.profil)).languages).toEqual(before)
	})
})

describe('Le serveur valide les bornes, et refuse en français', () => {
	test('un prix négatif est refusé en français, pour une prestation comme pour une option ; rien n’est écrit', async () => {
		const a = await artist()
		await save(a, { serviceOffers: THREE_SERVICE_OFFERS })
		const before = (await stored(a.profil)).serviceOffers

		const serviceOffer = await save(a, { serviceOffers: [{ name: 'Mariée', priceText: '-50', priceFrom: -50 }] })
		const option = await save(a, {
			serviceOffers: [{ name: 'Soirée', options: [{ name: 'Faux cils', priceFrom: -15 }] }],
		})

		const message = 'Le prix doit être un montant entre 5 € et 10 000 €.'
		expect(serviceOffer.statut).toBe(400)
		expect(refusal(serviceOffer.corps)).toEqual([{ path: 'serviceOffers.0.priceFrom', message }])
		expect(option.statut).toBe(400)
		expect(refusal(option.corps)).toEqual([{ path: 'serviceOffers.0.options.0.priceFrom', message }])
		expect((await stored(a.profil)).serviceOffers).toEqual(before)
	})

	test('un prix vide avec un texte libre est accepté', async () => {
		const a = await artist()

		const response = await save(a, {
			serviceOffers: [{ name: 'Maquillage artistique', priceText: 'Sur devis, selon le projet', priceFrom: null }],
		})

		expect(response.statut).toBe(200)
		expect((await read(a)).serviceOffers).toMatchObject([
			{ name: 'Maquillage artistique', priceText: 'Sur devis, selon le projet', priceFrom: null },
		])
	})

	test('la fin d’une expérience avant son début est refusée, en français ; le même jour passe', async () => {
		const a = await artist()

		const beforeStart = await save(a, {
			experiences: [{ company: 'Studio fictif', startDate: '2023-06-01', endDate: '2023-05-31' }],
		})
		const sameDay = await save(a, {
			experiences: [
				{ company: 'Studio fictif', startDate: '2023-06-01T20:00:00+02:00', endDate: '2023-06-01T08:00:00+02:00' },
			],
		})

		expect(beforeStart.statut).toBe(400)
		expect(refusal(beforeStart.corps)).toEqual([
			{ path: 'experiences.0.endDate', message: 'La fin d’une expérience ne peut pas précéder son début.' },
		])
		expect(sameDay.statut).toBe(200)
		expect((await read(a)).experiences).toMatchObject([
			{ startDate: '2023-06-01T12:00:00.000Z', endDate: '2023-06-01T12:00:00.000Z' },
		])
	})

	test('un texte trop long, une date qui n’existe pas ou une formation à plus d’un an sont refusés, en français', async () => {
		const a = await artist()
		const inTwoYears = `${new Date().getUTCFullYear() + 2}-01-15`

		const response = await save(a, {
			skills: [{ name: 'a'.repeat(71) }],
			languages: [{ name: 'a'.repeat(70) }],
			serviceOffers: [{ name: 'Mariée', description: 'a'.repeat(2001) }],
			experiences: [{ company: 'Studio fictif', startDate: '2023-02-30' }],
			courses: [{ diploma: 'CAP Esthétique', graduatedAt: inTwoYears }],
		})

		expect(response.statut).toBe(400)
		expect(refusal(response.corps).sort((x, y) => x.path.localeCompare(y.path))).toEqual([
			{ path: 'courses.0.graduatedAt', message: 'Une date d’obtention ne peut pas dépasser d’un an la date du jour.' },
			{ path: 'experiences.0.startDate', message: 'Cette date n’est pas valide.' },
			{ path: 'serviceOffers.0.description', message: 'Ce texte ne doit pas dépasser 2000 caractères.' },
			{ path: 'skills.0.name', message: 'Ce texte ne doit pas dépasser 70 caractères.' },
		])
	})

	test('une date de l’an 0, que PostgreSQL ne stocke pas, est refusée en 400 et non en 500 (ticket 224)', async () => {
		const a = await artist()

		const response = await save(a, {
			experiences: [{ company: 'Studio fictif', startDate: '0000-01-01' }],
			courses: [{ diploma: 'CAP Esthétique', graduatedAt: '0000-12-31T00:00:00.000Z' }],
		})

		expect(response.statut).toBe(400)
		expect(refusal(response.corps).sort((x, y) => x.path.localeCompare(y.path))).toEqual([
			{ path: 'courses.0.graduatedAt', message: 'Cette date n’est pas valide.' },
			{ path: 'experiences.0.startDate', message: 'Cette date n’est pas valide.' },
		])
		expect((await stored(a.profil)).experiences ?? []).toEqual([])
	})

	test('une sauvegarde refusée ne vide aucune section déjà enregistrée', async () => {
		const a = await artist()
		await save(a, { serviceOffers: THREE_SERVICE_OFFERS, languages: [{ name: 'Anglais' }] })
		const before = await stored(a.profil)

		const response = await save(a, {
			serviceOffers: [{ name: 'Nouvelle' }],
			languages: [],
			experiences: [{ company: 'Studio fictif', startDate: '2023-06-01', endDate: '2022-01-01' }],
		})

		expect(response.statut).toBe(400)
		const after = await stored(a.profil)
		expect([after.serviceOffers, after.languages]).toEqual([before.serviceOffers, before.languages])
	})
})
