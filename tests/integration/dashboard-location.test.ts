import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { CITIES_SERVICE_MESSAGE } from '@/lib/dashboard/location'
import { artistProfile, type DashboardUser } from '@/lib/dashboard/my-profile'
import { withPublishableTransition } from '@/lib/dashboard/publishable-transition'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { saveLocation } from '@/lib/dashboard/save-location'
import { zoneReviewView } from '@/lib/dashboard/zone-review'
import { formatZone } from '@/lib/format-zone'
import type { Profile } from '@/payload-types'
import { createAccount, type TestAccount } from '../support/account-factory'
import { HttpResponse, http, simulate } from '../support/outgoing-http'
import { emptyBase, testPayload } from '../support/payload-test'
import { fileForPayload } from '../support/photos'

/**
 * The location saved from her space (ticket 123; plan 02 U16, I02, I19, E19-E29 for the zone): the
 * commune stored is the one of the official list for the code she chose, the radius is bounded, free
 * text and a forged name are refused, and a service of the communes that is down changes nothing.
 * The list is simulated (ticket 037): nothing goes out of this machine.
 */

afterEach(emptyBase)

type Artist = TestAccount<'maquilleuse'>

const LIST = 'https://geo.api.gouv.fr/communes'
const ANNECY = {
	nom: 'Annecy',
	code: '74010',
	codeDepartement: '74',
	codesPostaux: ['74000'],
	centre: { type: 'Point', coordinates: [6.1264, 45.9024] },
}
const LYON = {
	nom: 'Lyon',
	code: '69123',
	codeDepartement: '69',
	codesPostaux: ['69001', '69002', '69003'],
	centre: { type: 'Point', coordinates: [4.8357, 45.764] },
}

/** Two fictional communes that share one fictional postal code, as the fake list of the bench holds them. */
const VALBRUME = {
	nom: 'Valbrume',
	code: '74990',
	codeDepartement: '74',
	codesPostaux: ['74990'],
	centre: { type: 'Point', coordinates: [6.4, 45.95] },
}
const HAUTCOMBE = {
	...VALBRUME,
	nom: 'Hautcombe',
	code: '74991',
	centre: { type: 'Point', coordinates: [6.43, 45.97] },
}

/** The list answers for these communes, 404 for any other code, and records the codes asked. */
function officialList() {
	const requests: string[] = []
	simulate(
		http.get(`${LIST}/:code`, ({ params }) => {
			const code = String(params.code)
			requests.push(code)
			const found = [ANNECY, LYON, VALBRUME, HAUTCOMBE].find(commune => commune.code === code)
			return found ? HttpResponse.json(found) : new HttpResponse('Not Found', { status: 404 })
		})
	)
	return requests
}

async function userOf(payload: Payload, compte: Artist): Promise<DashboardUser> {
	const doc = await payload.findByID({ collection: 'pros', id: compte.id, depth: 0, overrideAccess: true })
	return { ...doc, collection: 'pros' } as DashboardUser
}

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

const INPUT = { codeInsee: '74010', rayonKm: 30, aDomicile: true }

describe('U16 : « Annecy » choisie, enregistrée', () => {
	test('le code INSEE, le nom, le département et le centre de la liste ; le libellé rendu est « Annecy (74) »', async () => {
		const requests = officialList()
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const before = await storedProfile(payload, a)

		const result = await saveLocation(payload, await userOf(payload, a), INPUT)

		expect(result).toEqual({
			ok: true,
			valeurs: {
				kind: 'city',
				codeInsee: '74010',
				libelle: 'Annecy (74)',
				countries: [],
				town: '',
				rayonKm: 30,
				aDomicile: true,
			},
		})
		expect(requests).toEqual(['74010'])
		const stored = await storedProfile(payload, a)
		expect(stored.city).toMatchObject({ name: 'Annecy', inseeCode: '74010', department: '74' })
		// The centre of the commune, to about 1 km.
		expect(stored.city?.latitude).toBe(45.9)
		expect(stored.city?.longitude).toBe(6.13)
		expect(stored.radiusKm).toBe(30)
		expect(stored.homeService).toBe(true)
		// I19: the slug does not move.
		expect(stored.slug).toBe(before.slug)
		// What the page reads next is the same commune.
		const read = await artistProfile(payload, await userOf(payload, a))
		expect(read?.city).toMatchObject({ name: 'Annecy', inseeCode: '74010', department: '74' })
	})

	test('changer de commune remplace tout : nom, code, département et centre', async () => {
		officialList()
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const user = await userOf(payload, a)
		await saveLocation(payload, user, INPUT)

		const result = await saveLocation(payload, user, { ...INPUT, codeInsee: '69123' })

		expect(result.ok && result.valeurs.libelle).toBe('Lyon (69)')
		const { city } = await storedProfile(payload, a)
		expect(city).toMatchObject({ name: 'Lyon', inseeCode: '69123', department: '69' })
		expect(city?.latitude).toBe(45.76)
		expect(city?.longitude).toBe(4.84)
	})

	test('seul le profil de A change', async () => {
		officialList()
		const a = await createAccount('maquilleuse')
		const b = await createAccount('maquilleuse')
		const payload = await testPayload()
		const beforeB = await storedProfile(payload, b)

		await saveLocation(payload, await userOf(payload, a), INPUT)

		const afterB = await storedProfile(payload, b)
		expect(afterB.city?.inseeCode ?? null).toBe(beforeB.city?.inseeCode ?? null)
		expect(afterB.radiusKm ?? null).toBe(beforeB.radiusKm ?? null)
	})
})

describe('le rayon est borné de 0 à 200 km, jamais « & km »', () => {
	test.each([201, 1000, -1, 12.5])('%p est refusé, rien n’est écrit', async rayonKm => {
		officialList()
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()

		const result = await saveLocation(payload, await userOf(payload, a), { ...INPUT, rayonKm })

		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.champs?.rayonKm).toContain('de 0 à 200 km')
		const stored = await storedProfile(payload, a)
		expect(stored.radiusKm ?? null).toBeNull()
		expect(stored.city?.inseeCode ?? null).toBeNull()
	})

	test('0 et 200 sont acceptés ; null efface le rayon', async () => {
		officialList()
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const user = await userOf(payload, a)
		for (const [radiusKm, expected] of [
			[0, 0],
			[200, 200],
			[null, null],
		] as const) {
			const result = await saveLocation(payload, user, { ...INPUT, rayonKm: radiusKm })
			expect(result.ok && result.valeurs.rayonKm).toBe(expected)
			expect((await storedProfile(payload, a)).radiusKm ?? null).toBe(expected)
		}
	})
})

describe('un texte libre n’est jamais une commune, côté serveur non plus', () => {
	test.each([
		{ codeInsee: 'Annecy' },
		{ codeInsee: '12 rue des Lilas, 74000 Annecy' },
		{ codeInsee: '' },
		{ codeInsee: null },
		{ codeInsee: 74010 },
		{ codeInsee: '20004' },
	])('le code %p est refusé sans interroger la liste, la commune stockée reste', async remplacement => {
		const requests = officialList()
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const user = await userOf(payload, a)
		await saveLocation(payload, user, INPUT)
		requests.length = 0

		const result = await saveLocation(payload, user, { ...INPUT, ...remplacement, rayonKm: 99 })

		expect(result.ok).toBe(false)
		expect(requests).toEqual([])
		const stored = await storedProfile(payload, a)
		expect(stored.city).toMatchObject({ name: 'Annecy', inseeCode: '74010' })
		expect(stored.radiusKm).toBe(30)
	})

	test('un nom, des coordonnées ou un champ réservé dans la requête la refusent en bloc', async () => {
		const requests = officialList()
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const user = await userOf(payload, a)

		for (const extra of [
			{ nom: 'Paris' },
			{ commune: { nom: 'Paris', codeInsee: '75056' } },
			{ latitude: 48.85, longitude: 2.35 },
			{ departement: '75' },
			{ status: 'published' },
			{ pro: 999 },
			{ adresse: '12 rue des Lilas' },
		]) {
			const result = await saveLocation(payload, user, { ...INPUT, ...extra })
			expect(result).toEqual({ ok: false, message: FAILURE_MESSAGE })
		}
		expect(requests).toEqual([])
		expect((await storedProfile(payload, a)).city?.inseeCode ?? null).toBeNull()
	})

	test('un code que la liste ne connaît pas (404) est refusé sous le champ de la commune', async () => {
		officialList()
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()

		const result = await saveLocation(payload, await userOf(payload, a), {
			...INPUT,
			codeInsee: '74999',
		})

		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.champs?.codeInsee).toContain('pas dans la liste officielle')
		expect((await storedProfile(payload, a)).city?.inseeCode ?? null).toBeNull()
	})

	test('le nom stocké est celui de la liste, pas un autre : un code ne s’enregistre pas avec le nom d’une autre commune', async () => {
		// The list answers for 74010 with the name Annecy whatever the request says.
		officialList()
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		await saveLocation(payload, await userOf(payload, a), INPUT)
		expect((await storedProfile(payload, a)).city?.name).toBe('Annecy')
	})
})

describe('le service des communes en panne : message clair, ancienne commune gardée', () => {
	test.each([
		['une réponse 500', () => new HttpResponse(null, { status: 500 })],
		['un réseau coupé', () => HttpResponse.error()],
		['une réponse qui n’est pas une commune', () => HttpResponse.json({ ok: true })],
	])('%s', async (_nom, panne) => {
		officialList()
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const user = await userOf(payload, a)
		await saveLocation(payload, user, INPUT)

		simulate(http.get(`${LIST}/69123`, panne))
		const result = await saveLocation(payload, user, { ...INPUT, codeInsee: '69123', rayonKm: 80 })

		expect(result).toEqual({ ok: false, message: CITIES_SERVICE_MESSAGE })
		const stored = await storedProfile(payload, a)
		expect(stored.city).toMatchObject({ name: 'Annecy', inseeCode: '74010', department: '74' })
		// Nothing of the refused save was kept: not the radius either.
		expect(stored.radiusKm).toBe(30)
	})

	test('la commune qu’elle a déjà ne demande rien à la liste : son rayon se change même en panne', async () => {
		officialList()
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const user = await userOf(payload, a)
		await saveLocation(payload, user, INPUT)

		// The commune has its postal codes: the list is not asked. From here, any call to the list fails
		// (an undeclared request would fail the test too).
		simulate(http.get(`${LIST}/:code`, () => new HttpResponse(null, { status: 500 })))
		const result = await saveLocation(payload, user, { ...INPUT, rayonKm: 45, aDomicile: false })

		expect(result).toEqual({
			ok: true,
			valeurs: {
				kind: 'city',
				codeInsee: '74010',
				libelle: 'Annecy (74)',
				countries: [],
				town: '',
				rayonKm: 45,
				aDomicile: false,
			},
		})
		const stored = await storedProfile(payload, a)
		expect(stored.city).toMatchObject({ name: 'Annecy', inseeCode: '74010', department: '74' })
		expect(stored.radiusKm).toBe(45)
	})
})

describe('I02 : le profil écrit est celui du compte', () => {
	test('un compte de l’administration n’a pas de profil à écrire', async () => {
		officialList()
		const admin = await createAccount('admin')
		const payload = await testPayload()
		const doc = await payload.findByID({ collection: 'admins', id: admin.id, depth: 0, overrideAccess: true })
		const user = { ...doc, collection: 'admins' } as unknown as DashboardUser
		expect(await saveLocation(payload, user, INPUT)).toEqual({ ok: false, message: FAILURE_MESSAGE })
	})
})

/** The stored zone without access control, and the postal codes the commune holds. */
async function storedZone(payload: Payload, compte: Artist) {
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

describe('265 : les codes postaux de la commune sont ceux de la liste, jamais ceux d’une requête', () => {
	test('la commune enregistrée garde les codes postaux que la liste donne pour son code INSEE', async () => {
		officialList()
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		await saveLocation(payload, await userOf(payload, a), INPUT)
		expect((await storedZone(payload, a)).city?.postalCodes).toEqual(['74000'])
	})

	test('changer de commune remplace les codes postaux ; ceux de l’ancienne ne restent pas', async () => {
		officialList()
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const user = await userOf(payload, a)
		await saveLocation(payload, user, INPUT)
		await saveLocation(payload, user, { ...INPUT, codeInsee: '69123' })
		expect((await storedZone(payload, a)).city?.postalCodes).toEqual(['69001', '69002', '69003'])
	})

	test.each([
		{ postalCodes: ['99999'] },
		{ codesPostaux: ['99999'] },
		{ codePostal: '99999' },
		{ city: { name: 'Annecy', inseeCode: '74010', postalCodes: ['99999'] } },
	])('une requête qui envoie des codes postaux (%p) est refusée entière, rien n’est écrit', async extra => {
		const requests = officialList()
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()

		const result = await saveLocation(payload, await userOf(payload, a), { ...INPUT, ...extra })

		expect(result).toEqual({ ok: false, message: FAILURE_MESSAGE })
		expect(requests).toEqual([])
		const stored = await storedZone(payload, a)
		expect(stored.city?.inseeCode ?? null).toBeNull()
		expect(stored.city?.postalCodes ?? []).toEqual([])
	})

	test('le rattrapage : une commune enregistrée sans codes postaux les reçoit au prochain enregistrement, sans changer de commune', async () => {
		const requests = officialList()
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const profile = await storedZone(payload, a)
		// A profile saved before the postal codes existed: the commune, and none.
		await payload.update({
			collection: 'profiles',
			id: profile.id,
			data: { city: { name: 'Annecy', inseeCode: '74010' }, radiusKm: 30 },
		})
		expect((await storedZone(payload, a)).city?.postalCodes ?? []).toEqual([])

		const result = await saveLocation(payload, await userOf(payload, a), { ...INPUT, rayonKm: 40 })

		expect(result.ok).toBe(true)
		expect(requests).toEqual(['74010'])
		const stored = await storedZone(payload, a)
		expect(stored.city).toMatchObject({ name: 'Annecy', inseeCode: '74010', postalCodes: ['74000'] })
		expect(stored.radiusKm).toBe(40)
	})

	test('le rattrapage en panne : le rayon est enregistré, la commune reste, aucun refus', async () => {
		officialList()
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const profile = await storedZone(payload, a)
		await payload.update({
			collection: 'profiles',
			id: profile.id,
			data: { city: { name: 'Annecy', inseeCode: '74010' }, radiusKm: 30 },
		})
		for (const answer of [
			() => new HttpResponse(null, { status: 500 }),
			() => new HttpResponse('Not Found', { status: 404 }),
			() => HttpResponse.json({ ok: true }),
		]) {
			simulate(http.get(`${LIST}/74010`, answer))
			const result = await saveLocation(payload, await userOf(payload, a), { ...INPUT, rayonKm: 55 })
			expect(result.ok && result.valeurs.rayonKm).toBe(55)
		}
		const stored = await storedZone(payload, a)
		expect(stored.city).toMatchObject({ name: 'Annecy', inseeCode: '74010' })
		expect(stored.city?.postalCodes ?? []).toEqual([])
	})
})

describe('265 : la zone à revoir se règle d’un appui sur une commune', () => {
	const REVIEW: NonNullable<Profile['zoneReview']> = {
		reason: 'sharedPostalCode',
		postalCode: '74990',
		candidates: [
			{ inseeCode: '74990', name: 'Valbrume', department: '74' },
			{ inseeCode: '74991', name: 'Hautcombe', department: '74' },
		],
	}

	test('la propriétaire lit la revue avec la page ; un appui enregistre la commune et vide la revue', async () => {
		officialList()
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const user = await userOf(payload, a)
		const profile = await storedZone(payload, a)
		await payload.update({ collection: 'profiles', id: profile.id, data: { zoneReview: REVIEW } })

		const before = await artistProfile(payload, user)
		expect(zoneReviewView(before?.zoneReview)).toEqual({
			codePostal: '74990',
			communes: [
				{ codeInsee: '74990', libelle: 'Valbrume (74)' },
				{ codeInsee: '74991', libelle: 'Hautcombe (74)' },
			],
		})

		// The tap sends the code of the commune and her radius, nothing of the review.
		const result = await saveLocation(payload, user, {
			kind: 'city',
			codeInsee: '74991',
			rayonKm: null,
			aDomicile: false,
		})

		expect(result.ok && result.valeurs.libelle).toBe('Hautcombe (74)')
		const stored = await storedZone(payload, a)
		expect(stored.city).toMatchObject({ name: 'Hautcombe', inseeCode: '74991', postalCodes: ['74990'] })
		expect(stored.zoneReview).toMatchObject({ reason: null, postalCode: null, candidates: null })
		expect(zoneReviewView((await artistProfile(payload, user))?.zoneReview)).toBeNull()
	})

	test('une revue ne se pose pas par la requête de l’espace', async () => {
		officialList()
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const result = await saveLocation(payload, await userOf(payload, a), { ...INPUT, zoneReview: REVIEW })
		expect(result).toEqual({ ok: false, message: FAILURE_MESSAGE })
	})

	test('le nom de la commune enregistrée vient de la liste, pas du JSON de la revue', async () => {
		officialList()
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const profile = await storedZone(payload, a)
		await payload.update({
			collection: 'profiles',
			id: profile.id,
			data: {
				zoneReview: { ...REVIEW, candidates: [{ inseeCode: '74990', name: 'Nom inventé', department: '74' }] },
			},
		})
		await saveLocation(payload, await userOf(payload, a), {
			kind: 'city',
			codeInsee: '74990',
			rayonKm: null,
			aDomicile: false,
		})
		expect((await storedZone(payload, a)).city?.name).toBe('Valbrume')
	})
})

describe('266 : une zone de pays, enregistrée toute seule', () => {
	const BELGIUM = { kind: 'countries', countries: ['BE'], town: 'Bruxelles', rayonKm: 30, aDomicile: true } as const

	test('[BE] avec Bruxelles, puis [FR, IT], puis une commune : chaque fois la seule forme envoyée, et la page la dit', async () => {
		officialList()
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const user = await userOf(payload, a)
		// The zone as the public page says it (the card of the old space said the same words).
		const publicZone = async () => {
			const profile = await artistProfile(payload, user)
			return formatZone({
				city: profile?.city?.name,
				radius: profile?.radiusKm,
				zoneKind: profile?.zoneKind,
				countries: profile?.countries,
				town: profile?.town,
			})
		}

		await saveLocation(payload, user, INPUT)
		expect((await storedZone(payload, a)).city?.inseeCode).toBe('74010')

		const be = await saveLocation(payload, user, BELGIUM)
		expect(be).toEqual({
			ok: true,
			valeurs: {
				kind: 'countries',
				codeInsee: '',
				libelle: '',
				countries: ['BE'],
				town: 'Bruxelles',
				rayonKm: 30,
				aDomicile: true,
			},
		})
		let stored = await storedZone(payload, a)
		expect(stored).toMatchObject({ zoneKind: 'countries', countries: ['BE'], town: 'Bruxelles', radiusKm: 30 })
		// The commune is gone, with its postal codes.
		expect(stored.city?.name ?? null).toBeNull()
		expect(stored.city?.postalCodes ?? []).toEqual([])
		expect(await publicZone()).toBe('Bruxelles (Belgique) et 30 km autour')

		const two = await saveLocation(payload, user, {
			kind: 'countries',
			countries: ['FR', 'IT'],
			town: null,
			rayonKm: null,
			aDomicile: true,
		})
		expect(two.ok && two.valeurs).toMatchObject({ kind: 'countries', countries: ['FR', 'IT'], town: '' })
		stored = await storedZone(payload, a)
		expect(stored).toMatchObject({ zoneKind: 'countries', countries: ['FR', 'IT'] })
		expect(stored.town ?? null).toBeNull()
		expect(await publicZone()).toBe('France et Italie')

		const back = await saveLocation(payload, user, { ...INPUT, kind: 'city', codeInsee: '69123' })
		expect(back.ok && back.valeurs).toMatchObject({ kind: 'city', codeInsee: '69123', countries: [], town: '' })
		stored = await storedZone(payload, a)
		expect(stored).toMatchObject({ zoneKind: 'city' })
		expect(stored.city).toMatchObject({ name: 'Lyon', inseeCode: '69123' })
		expect(stored.countries ?? []).toEqual([])
		expect(stored.town ?? null).toBeNull()
	})

	test('l’ordre des pays est celui de la maquilleuse', async () => {
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const result = await saveLocation(payload, await userOf(payload, a), {
			kind: 'countries',
			countries: ['IT', 'BE', 'ES'],
			town: null,
			rayonKm: null,
			aDomicile: false,
		})
		expect(result.ok && result.valeurs.countries).toEqual(['IT', 'BE', 'ES'])
		expect((await storedZone(payload, a)).countries).toEqual(['IT', 'BE', 'ES'])
	})

	test.each([
		[
			'[FR] seul',
			{ countries: ['FR'], town: null },
			'countries',
			'Choisis au moins un pays étranger : pour la France, écris ta commune.',
		],
		['six pays', { countries: ['BE', 'IT', 'ES', 'DE', 'CH', 'LU'], town: null }, 'countries', '5 pays au plus.'],
		[
			'une adresse',
			{ town: '12 rue des Lilas' },
			'town',
			'Écris le nom de ta ville, pas ton adresse : elle ne s’enregistre jamais.',
		],
	])('%s : refusé avec son message, rien n’est écrit', async (_nom, remplacement, champ, message) => {
		const requests = officialList()
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const user = await userOf(payload, a)
		await saveLocation(payload, user, INPUT)

		const result = await saveLocation(payload, user, { ...BELGIUM, ...remplacement })

		expect(result.ok).toBe(false)
		if (result.ok) return
		expect((result.champs as Record<string, string> | undefined)?.[champ]).toBe(message)
		const stored = await storedZone(payload, a)
		expect(stored.city?.inseeCode).toBe('74010')
		expect(stored.countries ?? []).toEqual([])
		expect(requests).toEqual(['74010'])
	})

	test.each([
		{ codeInsee: '74010' },
		{ postalCodes: ['74000'] },
		{ zoneKind: 'city' },
		{ zoneReview: { reason: null } },
		{ city: { name: 'Annecy', inseeCode: '74010' } },
		{ slug: 'autre' },
	])('une requête de pays qui mêle ou ajoute %p est refusée entière', async extra => {
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const result = await saveLocation(payload, await userOf(payload, a), { ...BELGIUM, ...extra })
		expect(result).toEqual({ ok: false, message: FAILURE_MESSAGE })
		const stored = await storedZone(payload, a)
		expect(stored.countries ?? []).toEqual([])
		expect(stored.city?.inseeCode ?? null).toBeNull()
	})

	test('la revue est vidée par une zone de pays aussi', async () => {
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const profile = await storedZone(payload, a)
		await payload.update({
			collection: 'profiles',
			id: profile.id,
			data: { zoneReview: { reason: 'notFound', postalCode: null, candidates: null } },
		})
		await saveLocation(payload, await userOf(payload, a), BELGIUM)
		expect((await storedZone(payload, a)).zoneReview?.reason ?? null).toBeNull()
	})

	test('un profil rempli par ailleurs devient publiable en enregistrant [BE], comme avec une commune', async () => {
		officialList()
		const payload = await testPayload()
		const filled = async (): Promise<{ account: Artist; user: DashboardUser }> => {
			const account = await createAccount('maquilleuse')
			const profile = await storedZone(payload, account)
			const photo = await payload.create({
				collection: 'media',
				data: { owner: Number(account.id) },
				file: fileForPayload(),
			})
			await payload.update({
				collection: 'profiles',
				id: profile.id,
				data: {
					mainPicture: photo.id,
					specialty: 'Mariage',
					serviceOffers: [{ name: 'Prestation fictive', priceFrom: 80 }],
					description: 'Maquilleuse fictive, pour les essais du banc. '.repeat(5),
					networks: { instagram: '@compte.fictif' },
				},
			})
			return { account, user: await userOf(payload, account) }
		}
		for (const request of [BELGIUM, INPUT]) {
			const { account, user } = await filled()
			expect((await storedZone(payload, account)).publishable).toBe(false)

			const result = await withPublishableTransition(payload, user, () => saveLocation(payload, user, request))

			expect(result.ok && result.devenuPublicable).toBe(true)
			expect((await storedZone(payload, account)).publishable).toBe(true)
		}
	})
})
