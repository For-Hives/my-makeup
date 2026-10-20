import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { COURSES } from '@/lib/dashboard/courses'
import { EXPERIENCES } from '@/lib/dashboard/experiences'
import type { ListDefinition, RowValues } from '@/lib/dashboard/list'
import { artistProfile, type DashboardUser } from '@/lib/dashboard/my-profile'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { saveList } from '@/lib/dashboard/save-list'
import { SERVICE_OFFERS } from '@/lib/dashboard/service-offers'
import { createAccount, type TestAccount } from '../support/account-factory'
import { ANNECY } from '../support/completeness-cases'
import { emptyBase, testPayload } from '../support/payload-test'
import { fileForPayload } from '../support/photos'
import { emptyStorage } from '../support/s3'

/**
 * The lists saved from her space (tickets 129 to 131; docs/qualite.md §3 L1, plan 02 U29, U30, U04,
 * E31): rows with an identifier each, the order kept, a refusal that leaves the database as it was,
 * a price read by the single rule, and the options of an offer kept. Made-up values only.
 */

afterEach(async () => {
	await Promise.all([emptyBase(), emptyStorage()])
})

type Artist = TestAccount<'maquilleuse'>

async function storedProfile(payload: Payload, compte: Artist) {
	const { docs } = await payload.find({
		collection: 'profiles',
		depth: 0,
		overrideAccess: true,
		where: { pro: { equals: compte.id } },
	})
	const profile = docs[0]
	if (!profile) throw new Error('pas de profil')
	return profile
}

async function artist() {
	const account = await createAccount('maquilleuse')
	const payload = await testPayload()
	const doc = await payload.findByID({ collection: 'pros', id: account.id, depth: 0, overrideAccess: true })
	const user = { ...doc, collection: 'pros' } as DashboardUser
	const profile = await storedProfile(payload, account)
	return { compte: account, payload, utilisateur: user, id: profile.id }
}

const save = (
	m: Awaited<ReturnType<typeof artist>>,
	definition: ListDefinition,
	lignes: readonly {
		id?: string
		valeurs: RowValues
		options?: readonly { id?: string; valeurs: RowValues }[]
	}[]
) => saveList(m.payload, m.utilisateur, { lignes }, definition)

const EXPERIENCE: RowValues = {
	jobTitle: 'Maquilleuse',
	company: 'Studio Fictif',
	city: 'Lyon',
	startDate: '2020-03-01',
	endDate: '',
	description: '',
}
const COURSE: RowValues = {
	diploma: 'CAP esthétique',
	school: 'École Fictive',
	graduatedAt: '2018-06-30',
	description: '',
}

describe('129 : les expériences', () => {
	test('L1 : deux lignes identiques ont chacune leur identifiant, et se changent séparément', async () => {
		const m = await artist()
		const first = await save(m, EXPERIENCES, [{ valeurs: EXPERIENCE }, { valeurs: EXPERIENCE }])
		if (!first.ok) throw new Error(first.message)
		const [a, b] = first.valeurs.lignes
		expect(a?.id).toBeTruthy()
		expect(b?.id).toBeTruthy()
		expect(a?.id).not.toBe(b?.id)

		// Changing the second leaves the first; the order and the identifiers stay.
		const second = await save(m, EXPERIENCES, [
			{ id: a?.id, valeurs: EXPERIENCE },
			{ id: b?.id, valeurs: { ...EXPERIENCE, jobTitle: 'Cheffe maquilleuse' } },
		])
		expect(second.ok && second.valeurs.lignes.map(ligne => [ligne.id, ligne.valeurs.jobTitle])).toEqual([
			[a?.id, 'Maquilleuse'],
			[b?.id, 'Cheffe maquilleuse'],
		])

		// Removing the first leaves the second, with its identifier.
		const third = await save(m, EXPERIENCES, [
			{ id: b?.id, valeurs: { ...EXPERIENCE, jobTitle: 'Cheffe maquilleuse' } },
		])
		expect(third.ok && third.valeurs.lignes.map(ligne => ligne.id)).toEqual([b?.id as string])
		expect((await storedProfile(m.payload, m.compte)).experiences).toHaveLength(1)
	})

	test('les jours sont gardés tels qu’écrits, l’ordre est celui de l’envoi, la page lit la même chose', async () => {
		const m = await artist()
		const lines = [
			{ valeurs: { ...EXPERIENCE, jobTitle: 'Troisième', startDate: '2022-01-15', endDate: '2022-12-31' } },
			{ valeurs: { ...EXPERIENCE, jobTitle: 'Première', startDate: '2018-01-01' } },
		]
		const result = await save(m, EXPERIENCES, lines)

		expect(result.ok && result.valeurs.lignes.map(ligne => ligne.valeurs)).toEqual(lines.map(ligne => ligne.valeurs))
		const stored = (await storedProfile(m.payload, m.compte)).experiences
		expect(stored?.map(ligne => ligne.jobTitle)).toEqual(['Troisième', 'Première'])
		expect(stored?.[0]).toMatchObject({ startDate: '2022-01-15T12:00:00.000Z', endDate: '2022-12-31T12:00:00.000Z' })
		expect(stored?.[1]?.endDate ?? null).toBeNull()
		const page = await artistProfile(m.payload, m.utilisateur)
		expect(page?.experiences?.map(ligne => ligne.jobTitle)).toEqual(['Troisième', 'Première'])
	})

	test('U30, E31 : une fin avant le début est refusée avec le nom de la ligne, la base ne bouge pas', async () => {
		const m = await artist()
		await save(m, EXPERIENCES, [{ valeurs: EXPERIENCE }])
		const before = await storedProfile(m.payload, m.compte)

		const result = await save(m, EXPERIENCES, [
			{ valeurs: EXPERIENCE },
			{ valeurs: { ...EXPERIENCE, company: 'Autre Studio', startDate: '2022-05-01', endDate: '2021-01-01' } },
		])

		expect(result).toEqual({
			ok: false,
			message: 'La ligne « Autre Studio » n’est pas valide : La fin d’une expérience ne peut pas précéder son début.',
		})
		const after = await storedProfile(m.payload, m.compte)
		expect(after.updatedAt).toBe(before.updatedAt)
		expect(after.experiences).toEqual(before.experiences)
	})

	test('une ligne neuve sans son entreprise est refusée ; une ligne importée vide ne bloque pas l’enregistrement des autres', async () => {
		const m = await artist()
		const withoutCompany = await save(m, EXPERIENCES, [{ valeurs: { ...EXPERIENCE, company: '' } }])
		expect(withoutCompany).toMatchObject({ ok: false })
		expect((await storedProfile(m.payload, m.compte)).experiences ?? []).toHaveLength(0)

		// A row of the old site with empty fields (SCHEMA.md §2, rule 2), written as the import writes it.
		await m.payload.update({
			collection: 'profiles',
			id: m.id,
			data: { experiences: [{ jobTitle: 'Reprise', company: null }] },
		})
		const storedOne = (await storedProfile(m.payload, m.compte)).experiences?.[0]
		const lines = [
			{
				id: storedOne?.id ?? undefined,
				valeurs: { ...EXPERIENCE, jobTitle: 'Reprise', company: '', startDate: '', city: '' },
			},
			{ valeurs: EXPERIENCE },
		]
		const result = await save(m, EXPERIENCES, lines)
		expect(result.ok && result.valeurs.lignes).toHaveLength(2)
		expect(result.ok && result.valeurs.lignes[0]?.id).toBe(storedOne?.id as string)
	})

	test('un identifiant inventé est une ligne neuve, jamais une ligne d’un autre profil (I02)', async () => {
		const a = await artist()
		const b = await artist()
		const at = await save(a, EXPERIENCES, [{ valeurs: EXPERIENCE }])
		if (!at.ok) throw new Error(at.message)
		const idOfA = at.valeurs.lignes[0]?.id

		const result = await save(b, EXPERIENCES, [{ id: idOfA, valeurs: { ...EXPERIENCE, jobTitle: 'Chez b' } }])

		expect(result.ok && result.valeurs.lignes[0]?.id).not.toBe(idOfA)
		expect((await storedProfile(a.payload, a.compte)).experiences?.[0]?.jobTitle).toBe('Maquilleuse')
	})

	test('une clé de plus refuse la requête entière, un compte sans profil reçoit le message du site', async () => {
		const m = await artist()
		const result = await saveList(
			m.payload,
			m.utilisateur,
			{ lignes: [{ valeurs: EXPERIENCE }], status: 'published' },
			EXPERIENCES
		)
		expect(result).toEqual({ ok: false, message: FAILURE_MESSAGE })
		expect((await storedProfile(m.payload, m.compte)).experiences ?? []).toHaveLength(0)

		const withoutProfile = await createAccount('maquilleuse-sans-profil')
		const doc = await m.payload.findByID({ collection: 'pros', id: withoutProfile.id, depth: 0, overrideAccess: true })
		expect(
			await saveList(m.payload, { ...doc, collection: 'pros' } as DashboardUser, { lignes: [] }, EXPERIENCES)
		).toEqual({ ok: false, message: FAILURE_MESSAGE })
	})
})

describe('130 : les formations', () => {
	test('L1 : les lignes sont écrites dans l’ordre, chacune avec son identifiant', async () => {
		const m = await artist()
		const result = await save(m, COURSES, [
			{ valeurs: COURSE },
			{ valeurs: COURSE },
			{ valeurs: { ...COURSE, diploma: 'BP esthétique' } },
		])
		if (!result.ok) throw new Error(result.message)
		const ids = result.valeurs.lignes.map(ligne => ligne.id)
		expect(new Set(ids).size).toBe(3)
		expect((await storedProfile(m.payload, m.compte)).courses?.map(ligne => ligne.diploma)).toEqual([
			'CAP esthétique',
			'CAP esthétique',
			'BP esthétique',
		])
		expect((await storedProfile(m.payload, m.compte)).courses?.[0]?.graduatedAt).toBe('2018-06-30T12:00:00.000Z')
	})

	test('U30, E31 : une date à plus d’un an dans le futur est refusée, la base ne bouge pas', async () => {
		const m = await artist()
		await save(m, COURSES, [{ valeurs: COURSE }])
		const before = await storedProfile(m.payload, m.compte)

		const result = await save(m, COURSES, [
			{ valeurs: COURSE },
			{ valeurs: { ...COURSE, diploma: 'Futur', graduatedAt: '2099-01-01' } },
		])

		expect(result).toEqual({
			ok: false,
			message:
				'La ligne « Futur » n’est pas valide : Une date d’obtention ne peut pas dépasser d’un an la date du jour.',
		})
		expect((await storedProfile(m.payload, m.compte)).updatedAt).toBe(before.updatedAt)
	})

	test('l’ordre change quand on envoie les lignes dans un autre ordre, et vider la liste la vide', async () => {
		const m = await artist()
		const first = await save(m, COURSES, [{ valeurs: COURSE }, { valeurs: { ...COURSE, diploma: 'BP esthétique' } }])
		if (!first.ok) throw new Error(first.message)
		const [a, b] = first.valeurs.lignes
		const inverse = await save(m, COURSES, [
			{ id: b?.id, valeurs: b?.valeurs ?? {} },
			{ id: a?.id, valeurs: a?.valeurs ?? {} },
		])
		expect(inverse.ok && inverse.valeurs.lignes.map(ligne => ligne.id)).toEqual([b?.id as string, a?.id as string])

		await save(m, COURSES, [])
		expect((await storedProfile(m.payload, m.compte)).courses ?? []).toHaveLength(0)
	})
})

describe('131 : les prestations', () => {
	test.each(['80', '80 €', 'à partir de 80'])('U29 : « %s » donne un prix de 80, le texte est gardé', async saisie => {
		const m = await artist()
		const result = await save(m, SERVICE_OFFERS, [{ valeurs: { name: 'Mariée', description: '', price: saisie } }])

		expect(result.ok && result.valeurs.lignes[0]?.valeurs.price).toBe(saisie)
		expect((await storedProfile(m.payload, m.compte)).serviceOffers?.[0]).toMatchObject({
			name: 'Mariée',
			priceFrom: 80,
			priceText: saisie,
		})
	})

	test('U29 : « sur devis » garde son texte sans montant, plusieurs formules sont rangées une par ligne', async () => {
		const m = await artist()
		await save(m, SERVICE_OFFERS, [
			{ valeurs: { name: 'Mariée', description: '', price: 'sur devis' } },
			{ valeurs: { name: 'Cours', description: 'Deux heures.', price: '60 € ; sur devis' } },
		])
		const [devis, ongoing] = (await storedProfile(m.payload, m.compte)).serviceOffers ?? []
		expect(devis).toMatchObject({ priceFrom: null, priceText: 'sur devis' })
		expect(ongoing).toMatchObject({ priceFrom: 60, priceText: '60 €\nsur devis', description: 'Deux heures.' })
	})

	test('un montant envoyé par la requête refuse la requête entière : le serveur le lit lui-même', async () => {
		const m = await artist()
		const result = await saveList(
			m.payload,
			m.utilisateur,
			{ lignes: [{ valeurs: { name: 'Mariée', description: '', price: 'sur devis', priceFrom: 5000 } }] },
			SERVICE_OFFERS
		)
		expect(result).toEqual({ ok: false, message: FAILURE_MESSAGE })
		expect((await storedProfile(m.payload, m.compte)).serviceOffers ?? []).toHaveLength(0)
	})

	test('les options d’une prestation sont gardées quand on change la prestation, avec leurs identifiants', async () => {
		const m = await artist()
		await m.payload.update({
			collection: 'profiles',
			id: m.id,
			data: {
				serviceOffers: [
					{
						name: 'Mariée',
						priceText: '80',
						priceFrom: 80,
						options: [
							{ name: 'Essai', priceText: '30', priceFrom: 30 },
							{ name: 'Cils', priceText: 'sur devis' },
						],
					},
				],
			},
		})
		const before = (await storedProfile(m.payload, m.compte)).serviceOffers?.[0]
		const idsBefore = before?.options?.map(option => option.id)
		expect(idsBefore).toHaveLength(2)

		const result = await save(m, SERVICE_OFFERS, [
			{ id: before?.id ?? undefined, valeurs: { name: 'Mariée du soir', description: '', price: '90' } },
		])

		expect(result.ok && result.valeurs.lignes[0]?.valeurs.name).toBe('Mariée du soir')
		const after = (await storedProfile(m.payload, m.compte)).serviceOffers?.[0]
		expect(after).toMatchObject({ name: 'Mariée du soir', priceFrom: 90 })
		expect(after?.options?.map(option => [option.id, option.name, option.priceFrom ?? null])).toEqual([
			[idsBefore?.[0], 'Essai', 30],
			[idsBefore?.[1], 'Cils', null],
		])
	})

	test('E31 : un nom trop long ou vide est refusé, la base ne bouge pas', async () => {
		const m = await artist()
		await save(m, SERVICE_OFFERS, [{ valeurs: { name: 'Mariée', description: '', price: '80' } }])
		const before = await storedProfile(m.payload, m.compte)

		const empty = await save(m, SERVICE_OFFERS, [{ valeurs: { name: '', description: '', price: '80' } }])
		const long = await save(m, SERVICE_OFFERS, [{ valeurs: { name: 'a'.repeat(71), description: '', price: '80' } }])

		expect(empty).toMatchObject({ ok: false })
		expect(long).toMatchObject({ ok: false })
		expect((await storedProfile(m.payload, m.compte)).updatedAt).toBe(before.updatedAt)
	})

	describe('U04 : une prestation chiffrée remplit le critère « publiable »', () => {
		async function allExceptOffer() {
			const m = await artist()
			const photo = await m.payload.create({
				collection: 'media',
				data: { owner: Number(m.compte.id) },
				file: fileForPayload(),
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
		const publishable = async (m: Awaited<ReturnType<typeof artist>>) =>
			(await storedProfile(m.payload, m.compte)).publishable

		test('« sur devis » seul ne suffit pas, un montant suffit, et le retirer ôte le critère', async () => {
			const m = await allExceptOffer()

			await save(m, SERVICE_OFFERS, [{ valeurs: { name: 'Mariée', description: '', price: 'sur devis' } }])
			expect(await publishable(m)).toBe(false)

			const numbered = await save(m, SERVICE_OFFERS, [
				{ valeurs: { name: 'Mariée', description: '', price: 'à partir de 80' } },
			])
			expect(numbered.ok).toBe(true)
			expect(await publishable(m)).toBe(true)

			await save(m, SERVICE_OFFERS, [])
			expect(await publishable(m)).toBe(false)
		})
	})
})

describe('132 : les options d’une prestation', () => {
	const BRIDAL: RowValues = { name: 'Mariée', description: '', price: '80' }
	const EVENING_LOOK: RowValues = { name: 'Soirée', description: '', price: '60' }
	const TRIAL: RowValues = { name: 'Essai', description: 'Une heure', price: '30' }
	const LASHES: RowValues = { name: 'Cils', description: '', price: 'sur devis' }
	const TOUCH_UPS: RowValues = { name: 'Retouches', description: '', price: '' }

	test('les options sont stockées sous la bonne prestation, dans l’ordre, avec le montant lu par le serveur', async () => {
		const m = await artist()
		const result = await save(m, SERVICE_OFFERS, [
			{ valeurs: BRIDAL, options: [{ valeurs: TRIAL }, { valeurs: LASHES }] },
			{ valeurs: EVENING_LOOK, options: [{ valeurs: TOUCH_UPS }] },
		])
		expect(result.ok).toBe(true)
		const storedMany = (await storedProfile(m.payload, m.compte)).serviceOffers ?? []
		expect(
			storedMany.map(p => [p.name, p.options?.map(o => [o.name, o.priceFrom ?? null, o.priceText ?? null])])
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
		const data = result.ok ? result.valeurs.lignes : []
		expect(data.map(l => l.options?.map(o => o.valeurs.name))).toEqual([['Essai', 'Cils'], ['Retouches']])
		expect(new Set(data.flatMap(l => l.options?.map(o => o.id) ?? [])).size).toBe(3)
	})

	test('L1 : une option renvoyée avec son identifiant le garde, une option ajoutée en reçoit un, l’ordre suit la requête', async () => {
		const m = await artist()
		const firstOne = await save(m, SERVICE_OFFERS, [
			{ valeurs: BRIDAL, options: [{ valeurs: TRIAL }, { valeurs: LASHES }] },
		])
		const [line] = firstOne.ok ? firstOne.valeurs.lignes : []
		const [test, lashes] = line?.options ?? []

		const secondOne = await save(m, SERVICE_OFFERS, [
			{
				id: line?.id,
				valeurs: BRIDAL,
				options: [{ id: lashes?.id, valeurs: LASHES }, { valeurs: TOUCH_UPS }, { id: test?.id, valeurs: TRIAL }],
			},
		])
		const options = secondOne.ok ? (secondOne.valeurs.lignes[0]?.options ?? []) : []
		expect(options.map(o => o.valeurs.name)).toEqual(['Cils', 'Retouches', 'Essai'])
		expect(options[0]?.id).toBe(lashes?.id ?? 'x')
		expect(options[2]?.id).toBe(test?.id ?? 'x')
		expect(options[1]?.id).not.toBe(test?.id)
		expect(options[1]?.id).not.toBe(lashes?.id)
	})

	test('retirer la dernière option la retire du stockage ; ne rien envoyer les garde', async () => {
		const m = await artist()
		const firstOne = await save(m, SERVICE_OFFERS, [{ valeurs: BRIDAL, options: [{ valeurs: TRIAL }] }])
		const id = firstOne.ok ? firstOne.valeurs.lignes[0]?.id : undefined

		await save(m, SERVICE_OFFERS, [{ id, valeurs: BRIDAL }])
		expect((await storedProfile(m.payload, m.compte)).serviceOffers?.[0]?.options).toHaveLength(1)

		await save(m, SERVICE_OFFERS, [{ id, valeurs: BRIDAL, options: [] }])
		expect((await storedProfile(m.payload, m.compte)).serviceOffers?.[0]?.options ?? []).toHaveLength(0)
	})

	test('un identifiant d’option qui n’est pas celui de cette prestation est remplacé, jamais repris', async () => {
		const m = await artist()
		const firstOne = await save(m, SERVICE_OFFERS, [
			{ valeurs: BRIDAL, options: [{ valeurs: TRIAL }] },
			{ valeurs: EVENING_LOOK, options: [{ valeurs: LASHES }] },
		])
		const [one, other] = firstOne.ok ? firstOne.valeurs.lignes : []
		const otherId = other?.options?.[0]?.id
		const result = await save(m, SERVICE_OFFERS, [
			{ id: one?.id, valeurs: BRIDAL, options: [{ id: otherId, valeurs: LASHES }] },
			{ id: other?.id, valeurs: EVENING_LOOK, options: [{ id: otherId, valeurs: LASHES }] },
		])
		const options = result.ok ? result.valeurs.lignes.map(l => l.options?.[0]?.id) : []
		expect(options[1]).toBe(otherId ?? 'x')
		expect(options[0]).not.toBe(otherId)
	})

	test('L6 : deux options identiques sont refusées, la base ne bouge pas', async () => {
		const m = await artist()
		await save(m, SERVICE_OFFERS, [{ valeurs: BRIDAL, options: [{ valeurs: TRIAL }] }])
		const before = await storedProfile(m.payload, m.compte)
		const result = await save(m, SERVICE_OFFERS, [
			{ valeurs: BRIDAL, options: [{ valeurs: TRIAL }, { valeurs: { ...TRIAL, name: ' Essai ' } }] },
		])
		expect(result).toMatchObject({ ok: false, message: expect.stringContaining('deux options identiques') })
		expect((await storedProfile(m.payload, m.compte)).serviceOffers).toEqual(before.serviceOffers)
	})

	test('E31 : une option sans nom, ou trop longue, est refusée avec son nom dans le message', async () => {
		const m = await artist()
		const empty = await save(m, SERVICE_OFFERS, [{ valeurs: BRIDAL, options: [{ valeurs: { ...TRIAL, name: '' } }] }])
		const longOne = await save(m, SERVICE_OFFERS, [
			{ valeurs: BRIDAL, options: [{ valeurs: { ...TRIAL, price: 'a'.repeat(71) } }] },
		])
		expect(empty).toMatchObject({ ok: false, message: expect.stringContaining('Le nom de l’option est requis.') })
		expect(longOne).toMatchObject({ ok: false, message: expect.stringContaining('« Essai »') })
		expect((await storedProfile(m.payload, m.compte)).serviceOffers ?? []).toHaveLength(0)
	})

	test('une requête qui porte un montant d’option, ou des options hors prestation, est refusée en entier', async () => {
		const m = await artist()
		const amount = await save(m, SERVICE_OFFERS, [
			{ valeurs: BRIDAL, options: [{ valeurs: { ...TRIAL, priceFrom: '30' } as RowValues }] },
		])
		const outsideServiceOffer = await save(m, EXPERIENCES, [{ valeurs: EXPERIENCE, options: [{ valeurs: TRIAL }] }])
		expect(amount).toEqual({ ok: false, message: FAILURE_MESSAGE })
		expect(outsideServiceOffer).toEqual({ ok: false, message: FAILURE_MESSAGE })
	})
})
