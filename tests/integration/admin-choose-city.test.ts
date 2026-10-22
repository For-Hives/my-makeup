import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import type { Profile } from '@/payload-types'
import { createAccount, type TestAccount } from '../support/account-factory'
import { HttpResponse, http, simulate } from '../support/outgoing-http'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'

/**
 * Ticket 308 (audit UX no. 25, reduced): from the sheet of a profile, an admin picks one commune of a zone
 * review by a button. The choice saves what the makeup artist's own choice saves, and a commune outside the
 * review is refused. Only the role `admin` may. The official list is simulated: nothing leaves this machine.
 */

afterEach(emptyBase)

const LIST = 'https://geo.api.gouv.fr/communes'
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
const ANNECY = {
	nom: 'Annecy',
	code: '74010',
	codeDepartement: '74',
	codesPostaux: ['74000'],
	centre: { type: 'Point', coordinates: [6.1264, 45.9024] },
}

const REVIEW: NonNullable<Profile['zoneReview']> = {
	reason: 'sharedPostalCode',
	postalCode: '74990',
	candidates: [
		{ inseeCode: '74990', name: 'Valbrume', department: '74' },
		{ inseeCode: '74991', name: 'Hautcombe', department: '74' },
	],
}

/** The list answers for these communes and records the codes asked. */
function officialList() {
	const asked: string[] = []
	simulate(
		http.get(`${LIST}/:code`, ({ params }) => {
			const code = String(params.code)
			asked.push(code)
			const found = [VALBRUME, HAUTCOMBE, ANNECY].find(commune => commune.code === code)
			return found ? HttpResponse.json(found) : new HttpResponse('Not Found', { status: 404 })
		})
	)
	return asked
}

async function profileToReview(payload: Payload, account: TestAccount<'maquilleuse'>) {
	const { docs } = await payload.find({
		collection: 'profiles',
		depth: 0,
		overrideAccess: true,
		where: { pro: { equals: account.id } },
	})
	const profile = docs[0]
	if (!profile) throw new Error('pas de profil')
	await payload.update({
		collection: 'profiles',
		id: profile.id,
		data: { radiusKm: 25, homeService: true, zoneReview: REVIEW },
		overrideAccess: true,
	})
	return profile.id
}

const stored = async (payload: Payload, id: number) =>
	payload.findByID({ collection: 'profiles', id, depth: 0, overrideAccess: true })

describe('308 : l’admin choisit une commune de la revue d’un appui', () => {
	test('la commune de la liste officielle est enregistrée, la revue est vidée, le rayon est gardé', async () => {
		const asked = officialList()
		const payload = await testPayload()
		const id = await profileToReview(payload, await createAccount('maquilleuse'))
		const admin = await createAccount('admin')

		const response = await callRest('POST', `/api/profiles/${id}/choose-city`, {
			corps: { inseeCode: '74991' },
			enTetes: admin.session.enTetes,
		})

		expect(response.statut).toBe(200)
		expect(asked).toEqual(['74991'])
		const profile = await stored(payload, id)
		// The state the makeup artist's own choice leaves (tests/integration/dashboard-location.test.ts).
		expect(profile.zoneKind).toBe('city')
		expect(profile.city).toMatchObject({
			name: 'Hautcombe',
			inseeCode: '74991',
			department: '74',
			postalCodes: ['74990'],
		})
		expect(profile.zoneReview).toMatchObject({ reason: null, postalCode: null, candidates: null })
		expect(profile.radiusKm).toBe(25)
		expect(profile.homeService).toBe(true)
	})

	test('une commune qui n’est pas dans la revue est refusée, même si la liste officielle la connaît', async () => {
		const asked = officialList()
		const payload = await testPayload()
		const id = await profileToReview(payload, await createAccount('maquilleuse'))
		const admin = await createAccount('admin')

		const response = await callRest('POST', `/api/profiles/${id}/choose-city`, {
			corps: { inseeCode: '74010' },
			enTetes: admin.session.enTetes,
		})

		expect(response.statut).toBe(400)
		expect(asked).toEqual([])
		const profile = await stored(payload, id)
		expect(profile.city?.inseeCode ?? null).toBeNull()
		expect(profile.zoneReview).toMatchObject({ reason: 'sharedPostalCode' })
	})

	test('un corps qui n’est pas un code INSEE seul est refusé', async () => {
		officialList()
		const payload = await testPayload()
		const id = await profileToReview(payload, await createAccount('maquilleuse'))
		const admin = await createAccount('admin')
		for (const corps of [
			{},
			{ inseeCode: 74991 },
			{ inseeCode: '74991', city: { name: 'Autre' } },
			{ inseeCode: '../x' },
		]) {
			const response = await callRest('POST', `/api/profiles/${id}/choose-city`, {
				corps,
				enTetes: admin.session.enTetes,
			})
			expect(response.statut).toBe(400)
		}
		expect((await stored(payload, id)).zoneReview).toMatchObject({ reason: 'sharedPostalCode' })
	})

	test('un profil inconnu : 404', async () => {
		officialList()
		const admin = await createAccount('admin')
		const response = await callRest('POST', '/api/profiles/99999999/choose-city', {
			corps: { inseeCode: '74991' },
			enTetes: admin.session.enTetes,
		})
		expect(response.statut).toBe(404)
	})

	test('seule l’admin peut : la rédaction, la maquilleuse et un visiteur reçoivent un refus et rien n’est écrit', async () => {
		officialList()
		const payload = await testPayload()
		const owner = await createAccount('maquilleuse')
		const id = await profileToReview(payload, owner)
		const editor = await createAccount('redaction')
		for (const enTetes of [editor.session.enTetes, owner.session.enTetes, {}]) {
			const response = await callRest('POST', `/api/profiles/${id}/choose-city`, {
				corps: { inseeCode: '74991' },
				enTetes,
			})
			expect(response.statut).toBe(403)
		}
		expect((await stored(payload, id)).zoneReview).toMatchObject({ reason: 'sharedPostalCode' })
	})
})
