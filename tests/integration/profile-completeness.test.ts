import { afterEach, describe, expect, test } from 'bun:test'
import type { Profile } from '@/payload-types'
import { createAccount, type TestAccount } from '../support/account-factory'
import {
	ANNECY,
	caseDocument,
	completenessInV3,
	excludedCity,
	OLD_SITE_RESPONSES,
	SHARED_CASE,
} from '../support/completeness-cases'
import { emptyBase, testPayload } from '../support/payload-test'
import { fileForForm, fileForPayload } from '../support/photos'
import { callRest, formWithFile } from '../support/rest'
import { emptyStorage } from '../support/s3'

/**
 * At every save, the server knows whether a profile is empty, active or publishable (ticket 044;
 * plan 02 §7.3, I20): it computes them with the single rule of the old site, stores them with the
 * date each took its value, and moves the status of the profile from draft to published and back,
 * unless an admin chose another status. Made-up values only, but for the commune, public reference data.
 */

afterEach(async () => {
	await Promise.all([emptyBase(), emptyStorage()])
})

// The tests that write one profile per case, or per condition, take longer than the default 5 s.

type Artist = TestAccount<'maquilleuse'>

/** The dates of the three flags. */
const DATES = ['activeSince', 'publishableSince', 'fullyEmptySince'] as const

/** A makeup artist of the factory, with the identifier of the profile her account received. */
async function artistAndItsProfile(): Promise<{ compte: Artist; profil: number }> {
	const account = await createAccount('maquilleuse')
	const payload = await testPayload()
	const [profile] = (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } }))
		.docs
	if (!profile) throw new Error('La fabrique n’a pas créé le profil de la maquilleuse.')
	return { compte: account, profil: profile.id }
}

/** The profile as the database holds it, read without access control. */
async function stored(id: number): Promise<Profile> {
	const payload = await testPayload()
	return payload.findByID({ collection: 'profiles', id, depth: 0 })
}

/** The state of a stored profile, and its status. */
async function state(id: number) {
	const profile = await stored(id)
	return {
		completeness: profile.completeness,
		active: profile.active,
		publishable: profile.publishable,
		fullyEmpty: profile.fullyEmpty,
		status: profile.status,
	}
}

/** She changes her own profile through REST, as her space will. */
async function modify(compte: Artist | TestAccount<'admin'>, profil: number, corps: Record<string, unknown>) {
	const response = await callRest('PATCH', `/api/profiles/${profil}?depth=0`, {
		enTetes: compte.session.enTetes,
		corps,
	})
	if (response.statut !== 200) throw new Error(`Enregistrement refusé : ${response.statut} ${response.texte}`)
	return response
}

/** A photo she sends through REST, as the site sends it: the identifier of its media. */
async function sendPhoto(compte: Artist): Promise<number> {
	const {
		statut: status,
		corps,
		texte: text,
	} = await callRest('POST', '/api/media?depth=0', {
		enTetes: compte.session.enTetes,
		formulaire: formWithFile(fileForForm()),
	})
	if (status !== 201) throw new Error(`L’envoi de la photo a échoué : ${status} ${text}`)
	return (corps as { doc: { id: number } }).doc.id
}

const DESCRIPTION = 'Maquilleuse fictive, pour les essais du banc. '.repeat(5)

/** Each of the six conditions of a publishable profile, alone, as she fills it in her space. */
const SIX_CONDITIONS: [string, (compte: Artist) => Promise<Record<string, unknown>>][] = [
	['photo principale', async compte => ({ mainPicture: await sendPhoto(compte) })],
	['ville exploitable', async () => ({ city: ANNECY })],
	['spécialité', async () => ({ specialty: 'Mariage' })],
	['offre avec un prix chiffré', async () => ({ serviceOffers: [{ name: 'Prestation fictive', priceFrom: 80 }] })],
	['description de 200 caractères', async () => ({ description: DESCRIPTION })],
	['canal de contact', async () => ({ networks: { instagram: '@compte.fictif' } })],
]

/** Everything a publishable profile has. */
async function allConditions(compte: Artist): Promise<Record<string, unknown>> {
	const parts = await Promise.all(SIX_CONDITIONS.map(([, fill]) => fill(compte)))
	return Object.assign({}, ...parts)
}

/** What empties each of the six conditions again. */
const NOTHING = {
	mainPicture: null,
	city: null,
	specialty: null,
	serviceOffers: [],
	description: null,
	networks: { instagram: null },
}

describe('Valeurs stockées égales à la fonction unique sur les cas partagés (I20, U01-U08)', () => {
	test('chaque cas partagé, écrit comme l’import l’écrira : l’état stocké est celui de la règle, et celui de l’ancien site', async () => {
		const payload = await testPayload()
		for (const [i, testCase] of SHARED_CASE.entries()) {
			const { compte: account, profil: profile } = await artistAndItsProfile()
			const photo = async () =>
				(await payload.create({ collection: 'media', data: { owner: Number(account.id) }, file: fileForPayload() })).id
			await payload.update({ collection: 'profiles', id: profile, data: await caseDocument(testCase.profil, photo) })

			const storedOne = await state(profile)
			const rule = completenessInV3(testCase.profil)
			expect([testCase.nom, storedOne]).toEqual([
				testCase.nom,
				{
					completeness: rule.score,
					active: rule.actif,
					publishable: rule.publiable,
					fullyEmpty: rule.entierementVide,
					status: rule.entierementVide ? 'draft' : 'published',
				},
			])
			// The old site, on the same case: only the « city » criterion of a text that is no commune
			// leaves the score; the quote form, which nothing turns on, never counts.
			const old = OLD_SITE_RESPONSES[i]
			if (!old) throw new Error(`Pas de réponse de l’ancien site pour « ${testCase.nom} ».`)
			expect([testCase.nom, storedOne.active, storedOne.fullyEmpty]).toEqual([
				testCase.nom,
				old.front.actif,
				old.api.entirelyEmpty,
			])
			expect([testCase.nom, storedOne.completeness]).toEqual([
				testCase.nom,
				old.front.score - (excludedCity(testCase.profil) ? 1 : 0),
			])
			expect([testCase.nom, storedOne.publishable]).toEqual([
				testCase.nom,
				testCase.options?.formulaireDevis ? false : old.front.publiable,
			])
		}
	}, 30_000)

	test('par REST, une modification de la maquilleuse recalcule l’état : actif, puis publiable', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()

		await modify(account, profile, {
			mainPicture: await sendPhoto(account),
			city: ANNECY,
			specialty: 'Mariage',
		})
		expect(await state(profile)).toEqual({
			completeness: 3,
			active: true,
			publishable: false,
			fullyEmpty: false,
			status: 'published',
		})

		await modify(account, profile, {
			description: DESCRIPTION,
			serviceOffers: [{ name: 'Prestation fictive', priceText: 'Sur devis' }],
			networks: { website: 'https://example.test' },
		})
		expect((await state(profile)).publishable).toBe(false)
		await modify(account, profile, { serviceOffers: [{ name: 'Prestation fictive', priceFrom: 80 }] })
		expect(await state(profile)).toEqual({
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
		const before = Date.now()
		const { profil: profile } = await artistAndItsProfile()

		const created = await stored(profile)
		expect(await state(profile)).toEqual({
			completeness: 0,
			active: false,
			publishable: false,
			fullyEmpty: true,
			status: 'draft',
		})
		expect(created.chosenStatus).toBe('automatic')
		for (const date of DATES) {
			expect([date, Date.parse(String(created[date])) >= before - 1000]).toEqual([date, true])
			expect([date, Date.parse(String(created[date])) <= Date.now()]).toEqual([date, true])
		}
		expect((await callRest('GET', `/api/profiles/${profile}`)).statut).toBe(404)
	})

	test('chacune des six conditions, seule, publie le profil, et le public le lit', async () => {
		for (const [condition, fill] of SIX_CONDITIONS) {
			const { compte: account, profil: profile } = await artistAndItsProfile()

			await modify(account, profile, await fill(account))

			expect([condition, await state(profile)]).toMatchObject([condition, { fullyEmpty: false, status: 'published' }])
			expect([condition, (await callRest('GET', `/api/profiles/${profile}`)).statut]).toEqual([condition, 200])
		}
	}, 30_000)

	test('une commune de plus de six mots est une ville exploitable : seule, elle publie le profil', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()

		// The only name of the official list (14/10/2026) the rule refused as it is.
		await modify(account, profile, { city: { name: 'Pont de Montvert - Sud Mont Lozère', inseeCode: '48116' } })

		expect(await state(profile)).toEqual({
			completeness: 1,
			active: false,
			publishable: false,
			fullyEmpty: false,
			status: 'published',
		})
		await modify(account, profile, { mainPicture: await sendPhoto(account), specialty: 'Mariage' })
		expect(await state(profile)).toMatchObject({ active: true, status: 'published' })
	})

	test('vidé de tout ce qui comptait, il repasse en brouillon, et le public ne le lit plus', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()
		await modify(account, profile, await allConditions(account))
		expect(await state(profile)).toMatchObject({ publishable: true, status: 'published' })

		await modify(account, profile, NOTHING)

		expect(await state(profile)).toMatchObject({ fullyEmpty: true, publishable: false, status: 'draft' })
		expect((await callRest('GET', `/api/profiles/${profile}`)).statut).toBe(404)
	})

	test('un téléphone qu’elle ne montre pas n’est pas un canal de contact ; montré, il l’est', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()
		const contactDetails = { phone: '06 39 98 55 55', email: 'contact-fictif@example.test' }

		await modify(account, profile, { contactDetails: contactDetails, publicContact: false })
		expect(await state(profile)).toMatchObject({ fullyEmpty: true, status: 'draft' })

		await modify(account, profile, { publicContact: true })
		expect(await state(profile)).toMatchObject({ fullyEmpty: false, status: 'published' })
	})

	test('une date ne bouge que quand sa case change de valeur', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()
		const created = await stored(profile)

		await modify(account, profile, { firstName: 'Prénom' })
		const renamed = await stored(profile)
		for (const date of DATES) expect([date, renamed[date]]).toEqual([date, created[date]])

		await modify(account, profile, { specialty: 'Mariage' })
		const filled = await stored(profile)
		expect(filled.activeSince).toBe(created.activeSince)
		expect(filled.publishableSince).toBe(created.publishableSince)
		expect(Date.parse(String(filled.fullyEmptySince))).toBeGreaterThan(Date.parse(String(created.fullyEmptySince)))
	})
})

describe('Un profil qui n’a qu’un nom reste entièrement vide', () => {
	test('prénom, nom et nom d’artiste : 2 sur 13, entièrement vide, en brouillon', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()

		await modify(account, profile, { firstName: 'Prénom', lastName: 'Fictif', artistName: 'Studio Fictif' })

		expect(await state(profile)).toEqual({
			completeness: 2,
			active: false,
			publishable: false,
			fullyEmpty: true,
			status: 'draft',
		})
		expect((await callRest('GET', `/api/profiles/${profile}`)).statut).toBe(404)
	})

	test('ni les listes, ni la galerie, ni le rayon ne sont une des six conditions', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()

		await modify(account, profile, {
			firstName: 'Prénom',
			lastName: 'Fictif',
			skills: [{ name: 'Compétence fictive' }],
			languages: [{ name: 'Langue fictive' }],
			courses: [{ diploma: 'Diplôme fictif' }],
			experiences: [{ jobTitle: 'Poste fictif' }],
			serviceOffers: [{ name: 'Prestation fictive', priceText: 'Sur devis' }],
			gallery: [await sendPhoto(account)],
			rayonKm: 30,
			homeService: true,
		})

		expect(await state(profile)).toMatchObject({ fullyEmpty: true, status: 'draft' })
	})
})

describe('Un profil masqué reste masqué quelle que soit la sauvegarde', () => {
	test('rempli, vidé, rempli par la maquilleuse, enregistré par l’admin ou par le serveur : toujours masqué', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()
		const admin = await createAccount('admin')
		await modify(account, profile, await allConditions(account))
		await modify(admin, profile, { chosenStatus: 'hidden', reason: 'Masqué pour le test' })
		expect(await state(profile)).toMatchObject({ publishable: true, status: 'hidden' })

		await modify(account, profile, NOTHING)
		expect(await state(profile)).toMatchObject({ fullyEmpty: true, status: 'hidden' })
		await modify(account, profile, await allConditions(account))
		expect(await state(profile)).toMatchObject({ publishable: true, status: 'hidden' })
		await modify(admin, profile, { internalNote: 'Relue' })
		expect((await state(profile)).status).toBe('hidden')
		// An admin's form that sends another status, with the stored choice: the status is not hers to write.
		await modify(admin, profile, { status: 'published', chosenStatus: 'hidden', internalNote: 'Relue encore' })
		expect((await state(profile)).status).toBe('hidden')
		const payload = await testPayload()
		await payload.update({ collection: 'profiles', id: profile, data: { firstName: 'Par le serveur' } })
		expect((await state(profile)).status).toBe('hidden')
		expect((await callRest('GET', `/api/profiles/${profile}`)).statut).toBe(404)

		// Only an admin shows it again, by handing it back to the rule.
		await modify(admin, profile, { chosenStatus: 'automatic' })
		expect(await state(profile)).toMatchObject({ publishable: true, status: 'published' })
	}, 30_000)
})

describe('Un statut posé par l’admin n’est jamais écrasé', () => {
	test('un brouillon posé sur un profil rempli, une publication posée sur un profil vide : gardés', async () => {
		const admin = await createAccount('admin')
		const filled = await artistAndItsProfile()
		await modify(filled.compte, filled.profil, { specialty: 'Mariage' })
		const empty = await artistAndItsProfile()

		await modify(admin, filled.profil, { chosenStatus: 'draft' })
		await modify(admin, empty.profil, { chosenStatus: 'published' })
		await modify(filled.compte, filled.profil, { description: DESCRIPTION })
		await modify(empty.compte, empty.profil, { firstName: 'Prénom' })

		expect(await state(filled.profil)).toMatchObject({ fullyEmpty: false, status: 'draft' })
		expect(await state(empty.profil)).toMatchObject({ fullyEmpty: true, status: 'published' })
		expect((await stored(filled.profil)).chosenStatus).toBe('draft')
		expect((await stored(empty.profil)).chosenStatus).toBe('published')
	})

	test('un formulaire d’admin chargé avant l’enregistrement de la maquilleuse ne fixe aucun statut', async () => {
		const admin = await createAccount('admin')
		const { compte: account, profil: profile } = await artistAndItsProfile()
		// What the admin's form holds, loaded while the profile was still an empty draft.
		const charge = await stored(profile)
		await modify(account, profile, { specialty: 'Mariage' })
		expect(await state(profile)).toMatchObject({ status: 'published' })

		// She saves her note, with the status and the choice her form loaded.
		await modify(admin, profile, { statut: charge.status, chosenStatus: charge.chosenStatus, internalNote: 'Relue' })

		expect(await state(profile)).toMatchObject({ fullyEmpty: false, status: 'published' })
		expect((await stored(profile)).chosenStatus).toBe('automatic')
		await modify(account, profile, { specialty: null })
		expect(await state(profile)).toMatchObject({ fullyEmpty: true, status: 'draft' })
	})

	test('le formulaire entier renvoyé tel qu’il a été chargé : la règle décide, rien n’est fixé', async () => {
		const admin = await createAccount('admin')
		const { compte: account, profil: profile } = await artistAndItsProfile()
		// The admin panel sends every field of the form it loaded.
		const { corps } = await callRest('GET', `/api/profiles/${profile}?depth=0`, { enTetes: admin.session.enTetes })
		const { id: _id, createdAt: _created, updatedAt: _modified, ...form } = corps as Record<string, unknown>
		await modify(account, profile, { specialty: 'Mariage' })

		await modify(admin, profile, { ...form, internalNote: 'Relue' })

		// Her speciality is lost with the old form, so the profile is empty again: a draft by the rule.
		expect(await state(profile)).toMatchObject({ fullyEmpty: true, status: 'draft' })
		expect((await stored(profile)).chosenStatus).toBe('automatic')
		await modify(account, profile, { specialty: 'Mariage' })
		expect(await state(profile)).toMatchObject({ fullyEmpty: false, status: 'published' })
	})

	test('l’admin choisit « automatique » : le statut suit de nouveau la règle, dès cet enregistrement', async () => {
		const admin = await createAccount('admin')
		const { compte: account, profil: profile } = await artistAndItsProfile()
		await modify(account, profile, { specialty: 'Mariage' })
		await modify(admin, profile, { chosenStatus: 'draft' })
		expect(await state(profile)).toMatchObject({ status: 'draft' })

		await modify(admin, profile, { chosenStatus: 'automatic' })

		expect(await state(profile)).toMatchObject({ status: 'published' })
		expect((await stored(profile)).chosenStatus).toBe('automatic')
	})
})

describe('Valeurs envoyées par la maquilleuse ignorées et recalculées', () => {
	test('par REST : l’état, ses dates, le statut et son choix envoyés sont ignorés ; le serveur les recalcule', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()
		const before = await stored(profile)

		const { corps } = await modify(account, profile, {
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

		const expected = {
			completeness: 0,
			active: false,
			publishable: false,
			fullyEmpty: true,
			status: 'draft',
		} as const
		expect(await state(profile)).toEqual(expected)
		expect((corps as { doc: unknown }).doc).toMatchObject(expected)
		const after = await stored(profile)
		expect(after.chosenStatus).toBe('automatic')
		for (const date of DATES) expect([date, after[date]]).toEqual([date, before[date]])
	})

	test('par l’API locale avec les règles actives, de même ; et le serveur lui-même ne les écrit pas', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()
		const payload = await testPayload()
		const user = {
			...(await payload.findByID({ collection: 'pros', id: account.id, depth: 0 })),
			collection: 'pros',
		}
		const sent = { completeness: 13, active: true, publishable: true, fullyEmpty: false }

		await payload.update({
			collection: 'profiles',
			id: profile,
			data: sent,
			overrideAccess: false,
			user: user as never,
		})
		expect(await state(profile)).toMatchObject({ completeness: 0, active: false, publishable: false, fullyEmpty: true })
		await payload.update({ collection: 'profiles', id: profile, data: sent })
		expect(await state(profile)).toMatchObject({ completeness: 0, active: false, publishable: false, fullyEmpty: true })
	})
})

describe('Une zone de pays rend le profil publiable comme sur l’ancien site (ticket 260)', () => {
	/** Everything a publishable profile has, but its zone. */
	async function withoutZone(compte: Artist): Promise<Record<string, unknown>> {
		const { city: _city, ...others } = await allConditions(compte)
		return others
	}

	test('un pays étranger avec sa ville, puis plusieurs pays : actif et publiable ; une zone vide ne l’est pas', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()
		await modify(account, profile, await withoutZone(account))
		expect(await state(profile)).toMatchObject({ active: false, publishable: false, status: 'published' })

		await modify(account, profile, { countries: ['BE'], town: 'Bruxelles' })
		expect(await state(profile)).toMatchObject({ active: true, publishable: true, completeness: 6 })

		await modify(account, profile, { countries: ['FR', 'IT'] })
		expect(await state(profile)).toMatchObject({ active: true, publishable: true })

		await modify(account, profile, { zoneKind: 'countries', countries: [] })
		expect(await state(profile)).toMatchObject({ active: false, publishable: false })
	})

	test('de la commune aux pays et retour : la lecture suit la zone, rien d’autre ne change', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()
		await modify(account, profile, { ...(await withoutZone(account)), city: ANNECY })
		const asCity = await state(profile)
		expect(asCity).toMatchObject({ active: true, publishable: true })

		await modify(account, profile, { countries: ['CH'] })
		expect(await state(profile)).toEqual(asCity)

		await modify(account, profile, { city: ANNECY })
		expect(await state(profile)).toEqual(asCity)
	})
})
