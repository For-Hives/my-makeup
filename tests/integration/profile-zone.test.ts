import { afterEach, describe, expect, test } from 'bun:test'
import { ValidationError } from 'payload'
import { NO_PROFILE_CONTEXT } from '@/collections/Profiles'
import { ZONE_MESSAGES } from '@/lib/profile/zone'
import { createAccount, randomPassword, type TestAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'

/**
 * The zone of a profile (ticket 041): a commune with its INSEE code, a radius and « à domicile »,
 * written by the makeup artist through REST as her space will, and by the server as the import
 * will. Communes are public reference data: Annecy, Ajaccio, Lyon and Saint-Barthélemy are real,
 * nothing else is (the street of an address is invented).
 */

afterEach(emptyBase)

const ANNECY = { name: 'Annecy', inseeCode: '74010', latitude: 45.8992, longitude: 6.1294 } as const
/** Annecy as the server stores it: its département, and the coordinates of its centre to about 1 km. */
const ANNECY_STORED = { ...ANNECY, department: '74', latitude: 45.9, longitude: 6.13 } as const
const EMPTY_CITY = { name: null, inseeCode: null, department: null, latitude: null, longitude: null } as const

type Artist = TestAccount<'maquilleuse'>

/** A makeup artist of the factory, with the identifier of the profile her account received. */
async function artistAndItsProfile(): Promise<{ compte: Artist; profil: number }> {
	const account = await createAccount('maquilleuse')
	const payload = await testPayload()
	const { docs } = await payload.find({
		collection: 'profiles',
		depth: 0,
		limit: 1,
		where: { pro: { equals: account.id } },
	})
	const profile = docs[0]?.id
	if (profile === undefined) throw new Error('La fabrique n’a pas créé le profil de la maquilleuse.')
	return { compte: account, profil: profile }
}

/** She changes her own profile through REST. */
const modify = (compte: Artist, profil: number, corps: Record<string, unknown>) =>
	callRest('PATCH', `/api/profiles/${profil}?depth=0`, { enTetes: compte.session.enTetes, corps })

/** The zone as the database holds it, read without access control. */
async function storedZone(profil: number) {
	const payload = await testPayload()
	const { city, radiusKm, homeService } = await payload.findByID({ collection: 'profiles', depth: 0, id: profil })
	return { city, radiusKm, homeService }
}

/** What a REST refusal says, field by field. */
function refusedFields(corps: unknown): { path: string; message: string }[] {
	const { errors = [] } = corps as { errors?: { data?: { errors?: { path: string; message: string }[] } }[] }
	return errors.flatMap(({ data }) => data?.errors ?? []).map(({ path, message }) => ({ path, message }))
}

describe('La zone enregistrée se relit telle quelle', () => {
	test('commune, rayon de 30 km et « à domicile », enregistrés par la maquilleuse puis relus', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()

		const saved = await modify(account, profile, { city: ANNECY, radiusKm: 30, homeService: true })
		expect(saved.statut).toBe(200)

		const expected = { city: ANNECY_STORED, radiusKm: 30, homeService: true }
		const reread = await callRest('GET', `/api/profiles/${profile}?depth=0`, { enTetes: account.session.enTetes })
		expect(reread.statut).toBe(200)
		expect(reread.corps).toMatchObject(expected)
		expect(await storedZone(profile)).toEqual(expected)
	})

	test('une sauvegarde d’un autre champ laisse la zone telle quelle', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()
		await modify(account, profile, { city: ANNECY, radiusKm: 30, homeService: false })

		expect((await modify(account, profile, { firstName: 'Léa' })).statut).toBe(200)

		expect(await storedZone(profile)).toEqual({ city: ANNECY_STORED, radiusKm: 30, homeService: false })
	})

	test('un profil créé avec son compte n’a pas encore de zone : rien n’est supposé', async () => {
		const { profil: profile } = await artistAndItsProfile()

		expect(await storedZone(profile)).toEqual({ city: EMPTY_CITY, radiusKm: null, homeService: null })
	})

	test('le département est calculé par le serveur depuis le code INSEE, quoi que la requête envoie', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()

		const ajaccio = { name: 'Ajaccio', inseeCode: ' 2a004 ', department: '13', latitude: 41.9192, longitude: 8.7386 }
		expect((await modify(account, profile, { city: ajaccio })).statut).toBe(200)
		expect((await storedZone(profile)).city).toEqual({
			...ajaccio,
			inseeCode: '2A004',
			department: '2A',
			latitude: 41.92,
			longitude: 8.74,
		})

		expect((await modify(account, profile, { city: { ...ANNECY, department: '2A' } })).statut).toBe(200)
		expect((await storedZone(profile)).city).toEqual(ANNECY_STORED)
	})

	test('toute la France : une commune d’une collectivité d’outre-mer de la liste officielle est acceptée', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()

		const stBarthelemy = { name: 'Saint-Barthélemy', inseeCode: '97701', latitude: 17.9, longitude: -62.83 }
		expect((await modify(account, profile, { city: stBarthelemy })).statut).toBe(200)
		expect((await storedZone(profile)).city).toEqual({ ...stBarthelemy, department: '977' })
	})

	test('vider la commune, champ par champ ou d’un coup, vide aussi son département', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()

		for (const empty of [{ ...EMPTY_CITY, department: '74' }, null]) {
			await modify(account, profile, { city: ANNECY, radiusKm: 30 })
			expect((await modify(account, profile, { city: empty })).statut, JSON.stringify(empty)).toBe(200)
			expect(await storedZone(profile), JSON.stringify(empty)).toEqual({
				city: EMPTY_CITY,
				radiusKm: 30,
				homeService: null,
			})
		}
	})
})

describe('Une zone mal formée est refusée en français, et rien ne change', () => {
	test('rayon hors bornes ou décimal : refusé ; 0 et 200 km acceptés', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()
		await modify(account, profile, { city: ANNECY, radiusKm: 30 })
		const before = await storedZone(profile)

		for (const radiusKm of [201, -1, 12.5, 1000]) {
			const refusal = await modify(account, profile, { radiusKm })
			expect(refusal.statut, String(radiusKm)).toBe(400)
			expect(refusedFields(refusal.corps), String(radiusKm)).toEqual([
				{ path: 'radiusKm', message: ZONE_MESSAGES.rayon },
			])
		}
		expect(await storedZone(profile)).toEqual(before)

		for (const radiusKm of [0, 200]) {
			expect((await modify(account, profile, { radiusKm })).statut, String(radiusKm)).toBe(200)
			expect((await storedZone(profile)).radiusKm).toBe(radiusKm)
		}
	})

	test('code INSEE mal formé : refusé', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()
		await modify(account, profile, { city: ANNECY })
		const before = await storedZone(profile)

		for (const codeInsee of ['7401', '740100', '20004', 'ABCDE', '97001', '98501']) {
			const refusal = await modify(account, profile, { city: { ...ANNECY, inseeCode: codeInsee } })
			expect(refusal.statut, codeInsee).toBe(400)
			expect(refusedFields(refusal.corps), codeInsee).toEqual([
				{ path: 'city.inseeCode', message: ZONE_MESSAGES.codeInseeMalForme },
			])
		}
		expect(await storedZone(profile)).toEqual(before)
	})

	test('commune sans code INSEE : refusée, qu’elle soit nouvelle ou qu’on retire son code', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()

		const fresh = await modify(account, profile, { city: { name: 'Annecy' } })
		expect(fresh.statut).toBe(400)
		expect(refusedFields(fresh.corps)).toEqual([
			{ path: 'city.inseeCode', message: ZONE_MESSAGES.communeSansCodeInsee },
		])
		expect((await storedZone(profile)).city).toEqual(EMPTY_CITY)

		await modify(account, profile, { city: ANNECY })
		const withoutCode = await modify(account, profile, { city: { ...ANNECY, inseeCode: '' } })
		expect(withoutCode.statut).toBe(400)
		expect(refusedFields(withoutCode.corps)).toEqual([
			{ path: 'city.inseeCode', message: ZONE_MESSAGES.communeSansCodeInsee },
		])
		expect((await storedZone(profile)).city).toEqual(ANNECY_STORED)
	})

	test('une ville en texte libre, comme sur l’ancien site, n’est pas une city : refusée', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()

		const cityName = await modify(account, profile, { city: 'Annecy' })
		expect(cityName.statut).toBe(400)
		expect(refusedFields(cityName.corps)).toEqual([
			{ path: 'city.inseeCode', message: ZONE_MESSAGES.communeSansCodeInsee },
		])

		const url = await modify(account, profile, { city: '12 rue des Lilas, 74000 Annecy' })
		expect(url.statut).toBe(400)
		expect(refusedFields(url.corps)).toEqual([
			{ path: 'city.name', message: ZONE_MESSAGES.nomAdresse },
			{ path: 'city.inseeCode', message: ZONE_MESSAGES.communeSansCodeInsee },
		])
		expect((await storedZone(profile)).city).toEqual(EMPTY_CITY)
	})

	test('une commune envoyée en liste est refusée, et son département reste celui de son code', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()
		await modify(account, profile, { city: ANNECY })

		for (const cityEntry of [[], ['Annecy'], [ANNECY]]) {
			const refusal = await modify(account, profile, { city: cityEntry })
			expect(refusal.statut, JSON.stringify(cityEntry)).toBe(400)
			expect(refusedFields(refusal.corps), JSON.stringify(cityEntry)).toEqual([
				{ path: 'city', message: ZONE_MESSAGES.communeSansCodeInsee },
			])
			expect((await storedZone(profile)).city, JSON.stringify(cityEntry)).toEqual(ANNECY_STORED)
		}

		// The import's path, the local API, is held by the same rule.
		const payload = await testPayload()
		const byServer = await payload
			.update({ collection: 'profiles', id: profile, data: { city: [] as never } })
			.catch((erreur: unknown) => erreur)
		expect(byServer).toBeInstanceOf(ValidationError)
		expect((await storedZone(profile)).city).toEqual(ANNECY_STORED)
	})

	test('la commune s’envoie entière : un nom sans son code, ou un code sans son nom, est refusé même quand l’autre est enregistré', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()
		await modify(account, profile, { city: ANNECY })

		const singleName = await modify(account, profile, { city: { name: 'Lyon' } })
		expect(singleName.statut).toBe(400)
		expect(refusedFields(singleName.corps)).toEqual([
			{ path: 'city.inseeCode', message: ZONE_MESSAGES.communeSansCodeInsee },
		])
		const codeOnly = await modify(account, profile, { city: { inseeCode: '69123' } })
		expect(codeOnly.statut).toBe(400)
		expect(refusedFields(codeOnly.corps)).toEqual([{ path: 'city.name', message: ZONE_MESSAGES.codeInseeSansNom }])
		expect((await storedZone(profile)).city).toEqual(ANNECY_STORED)

		// A new commune without coordinates does not keep those of the former one.
		expect((await modify(account, profile, { city: { name: 'Lyon', inseeCode: '69123' } })).statut).toBe(200)
		expect((await storedZone(profile)).city).toEqual({
			name: 'Lyon',
			inseeCode: '69123',
			department: '69',
			latitude: null,
			longitude: null,
		})
	})

	test('un nom qui ressemble à une adresse est refusé, même avec un code INSEE bien formé', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()
		await modify(account, profile, { city: ANNECY })

		for (const name of ['12 rue des Lilas, 74000 Annecy', 'rue des Lilas', 'Annecy 74000']) {
			const refusal = await modify(account, profile, { city: { ...ANNECY, name: name } })
			expect(refusal.statut, name).toBe(400)
			expect(refusedFields(refusal.corps), name).toEqual([{ path: 'city.name', message: ZONE_MESSAGES.nomAdresse }])
		}
		expect((await storedZone(profile)).city).toEqual(ANNECY_STORED)
	})

	test('un nom fait d’autres caractères que ceux d’un nom de commune est refusé : un email, un site, un symbole', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()
		await modify(account, profile, { city: ANNECY })

		for (const name of ['moi@exemple.test', 'www.site-fictif.test', 'St. Gervais', 'Annecy & alentours']) {
			const refusal = await modify(account, profile, { city: { ...ANNECY, name: name } })
			expect(refusal.statut, name).toBe(400)
			expect(refusedFields(refusal.corps), name).toEqual([{ path: 'city.name', message: ZONE_MESSAGES.nomCaracteres }])
		}
		expect((await storedZone(profile)).city).toEqual(ANNECY_STORED)
		// Its form only: whether the name is the one of its code, the list of the space and of the import says it.
		expect((await modify(account, profile, { city: { ...ANNECY, name: 'Lyon' } })).statut).toBe(200)
	})

	test('le serveur aussi est tenu par les bornes : l’import d’un rayon de 400 km est refusé, jamais ramené à 200', async () => {
		const payload = await testPayload()
		const account = await payload.create({
			collection: 'pros',
			data: { email: `zone-${crypto.randomUUID()}@example.test`, password: randomPassword(), _verified: true },
			context: NO_PROFILE_CONTEXT,
			disableVerificationEmail: true,
		})

		const refusal = await payload
			.create({ collection: 'profiles', data: { pro: account.id, slug: 'zone-importee', radiusKm: 400 } })
			.catch((erreur: unknown) => erreur)
		expect(refusal).toBeInstanceOf(ValidationError)
		expect((refusal as ValidationError).data.errors).toEqual([
			expect.objectContaining({ path: 'radiusKm', message: ZONE_MESSAGES.rayon }),
		])
		expect((await payload.count({ collection: 'profiles' })).totalDocs).toBe(0)

		const imported = await payload.create({
			collection: 'profiles',
			data: { pro: account.id, slug: 'zone-importee', city: ANNECY, radiusKm: 30 },
		})
		expect(imported).toMatchObject({ city: ANNECY_STORED, radiusKm: 30, homeService: null })
	})
})

describe('Les coordonnées de la commune sont celles de son centre, à environ 1 km près', () => {
	test('envoyées au huitième de décimale, elles sont gardées à deux, et le public ne lit que celles-là', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()

		const precise = { ...ANNECY, latitude: 48.85341234, longitude: 2.34881234 }
		expect((await modify(account, profile, { city: precise })).statut).toBe(200)

		const rounded = { latitude: 48.85, longitude: 2.35 }
		expect((await storedZone(profile)).city).toMatchObject(rounded)
		// With a commune, the profile is published (ticket 044): what the public reads.
		const publicValue = await callRest('GET', `/api/profiles/${profile}?depth=0`)
		expect(publicValue.statut).toBe(200)
		expect((publicValue.corps as { city: unknown }).city).toMatchObject(rounded)
	})

	test('le serveur aussi les arrondit : l’import d’un centre au mètre près', async () => {
		const { profil: profile } = await artistAndItsProfile()
		const payload = await testPayload()

		await payload.update({ collection: 'profiles', id: profile, data: { city: { ...ANNECY, latitude: 45.899247 } } })

		expect((await storedZone(profile)).city).toEqual(ANNECY_STORED)
	})
})

describe('Lecture anonyme : la commune et son département sortent avec le profil publié', () => {
	test('par REST et par l’API locale avec les règles actives, seul et en liste ; un brouillon ne sort pas', async () => {
		const { compte: account, profil: profile } = await artistAndItsProfile()
		const draft = await artistAndItsProfile()
		await modify(account, profile, { city: ANNECY, radiusKm: 30, homeService: true })
		await modify(draft.compte, draft.profil, { city: ANNECY })
		const payload = await testPayload()
		// With a commune, the rule of ticket 044 publishes the first; an admin holds the other as a draft.
		await payload.update({ collection: 'profiles', id: draft.profil, data: { chosenStatus: 'draft' } })

		const expected = { city: ANNECY_STORED, radiusKm: 30, homeService: true }
		const single = await callRest('GET', `/api/profiles/${profile}?depth=0`)
		expect(single.statut).toBe(200)
		expect(single.corps).toMatchObject(expected)
		const list = (await callRest('GET', '/api/profiles?depth=0')).corps as { docs: { id: number }[] }
		const locale = await payload.find({ collection: 'profiles', depth: 0, overrideAccess: false })
		for (const docs of [list.docs, locale.docs]) {
			expect(docs.map(({ id }) => id)).toEqual([profile])
			expect(docs[0]).toMatchObject(expected)
		}

		expect((await callRest('GET', `/api/profiles/${draft.profil}`)).statut).toBe(404)
	})
})
