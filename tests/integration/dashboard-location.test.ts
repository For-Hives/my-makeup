import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { CITIES_SERVICE_MESSAGE } from '@/lib/dashboard/location'
import { artistProfile, type DashboardUser } from '@/lib/dashboard/my-profile'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { saveLocation } from '@/lib/dashboard/save-location'
import { createAccount, type TestAccount } from '../support/account-factory'
import { HttpResponse, http, simulate } from '../support/outgoing-http'
import { emptyBase, testPayload } from '../support/payload-test'

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
	centre: { type: 'Point', coordinates: [6.1264, 45.9024] },
}
const LYON = {
	nom: 'Lyon',
	code: '69123',
	codeDepartement: '69',
	centre: { type: 'Point', coordinates: [4.8357, 45.764] },
}

/** The list answers for these communes, 404 for any other code, and records the codes asked. */
function officialList() {
	const requests: string[] = []
	simulate(
		http.get(`${LIST}/:code`, ({ params }) => {
			const code = String(params.code)
			requests.push(code)
			const found = [ANNECY, LYON].find(commune => commune.code === code)
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
			valeurs: { codeInsee: '74010', libelle: 'Annecy (74)', rayonKm: 30, aDomicile: true },
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

		// From here, any call to the list fails (an undeclared request would fail the test too).
		simulate(http.get(`${LIST}/:code`, () => new HttpResponse(null, { status: 500 })))
		const result = await saveLocation(payload, user, { ...INPUT, rayonKm: 45, aDomicile: false })

		expect(result).toEqual({
			ok: true,
			valeurs: { codeInsee: '74010', libelle: 'Annecy (74)', rayonKm: 45, aDomicile: false },
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
