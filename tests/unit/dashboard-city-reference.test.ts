import { describe, expect, test } from 'bun:test'
import {
	CITIES_DELAY_MS,
	cityFromCode,
	findCities,
	POSTAL_CODE_SUGGESTIONS_MAX,
	SUGGESTIONS_MAX,
	searchQuestion,
	suggestion,
} from '@/lib/dashboard/city-reference'
import { delay, HttpResponse, http, simulate } from '../support/outgoing-http'

/**
 * The official list of communes, asked by the space (ticket 123; ticket 037 for the simulation): the
 * answers it gives, what is never asked, and every way the service can fail, which is one outcome.
 * No test calls the Internet: the service is declared in each test.
 */

const LIST = 'https://geo.api.gouv.fr/communes'
const ANNECY = {
	nom: 'Annecy',
	code: '74010',
	codeDepartement: '74',
	codesPostaux: ['74000'],
	centre: { type: 'Point', coordinates: [6.1264, 45.9024] },
}

describe('la question posée à la liste', () => {
	test('un nom, un code postal de cinq chiffres, ou rien', () => {
		expect(searchQuestion('  Annecy  ')).toEqual({ genre: 'nom', valeur: 'Annecy' })
		expect(searchQuestion('Saint   Denis')).toEqual({ genre: 'nom', valeur: 'Saint Denis' })
		expect(searchQuestion('74000')).toEqual({ genre: 'codePostal', valeur: '74000' })
		expect(searchQuestion('A')).toEqual({ genre: 'rien', motif: 'trop-court' })
		expect(searchQuestion('   ')).toEqual({ genre: 'rien', motif: 'trop-court' })
	})

	test.each([
		'12 rue des Lilas',
		'rue des Lilas',
		'12 rue des Lilas, 74000 Annecy',
		'lea@example.test',
		'x'.repeat(61),
		'7400',
		'740000',
	])('« %s » ressemble à une adresse : jamais envoyée à la liste', texte => {
		expect(searchQuestion(texte)).toEqual({ genre: 'rien', motif: 'adresse' })
	})
})

describe('la recherche de communes', () => {
	test('Annecy : la commune, son code, son département, son libellé', async () => {
		let requestValue: URL | undefined
		simulate(
			http.get(LIST, ({ request }) => {
				requestValue = new URL(request.url)
				return HttpResponse.json([ANNECY])
			})
		)

		const response = await findCities('Annecy')

		expect(response).toEqual({
			genre: 'communes',
			communes: [
				{
					nom: 'Annecy',
					codeInsee: '74010',
					departement: '74',
					latitude: 45.9024,
					longitude: 6.1264,
					codesPostaux: ['74000'],
				},
			],
		})
		if (response.genre !== 'communes') throw new Error('attendu : des communes')
		expect(response.communes.map(suggestion)).toEqual([{ codeInsee: '74010', libelle: 'Annecy (74)', nom: 'Annecy' }])
		expect(requestValue?.searchParams.get('nom')).toBe('Annecy')
		expect(requestValue?.searchParams.get('limit')).toBe(String(SUGGESTIONS_MAX))
		// Nothing of the person goes with the question: no cookie, no account.
		expect([...(requestValue?.searchParams.keys() ?? [])].sort()).toEqual(['boost', 'fields', 'limit', 'nom'])
		// The postal codes are asked with the commune (ticket 265).
		expect(requestValue?.searchParams.get('fields')).toBe('nom,code,codesPostaux,codeDepartement,centre')
	})

	test('un code postal est demandé par son code postal', async () => {
		let requestValue: URL | undefined
		simulate(
			http.get(LIST, ({ request }) => {
				requestValue = new URL(request.url)
				return HttpResponse.json([ANNECY])
			})
		)
		await findCities('74000')
		expect(requestValue?.searchParams.get('codePostal')).toBe('74000')
		expect(requestValue?.searchParams.has('nom')).toBe(false)
	})

	test('un code postal dit quel code a été demandé ; un nom ne le dit pas (ticket 265)', async () => {
		simulate(http.get(LIST, () => HttpResponse.json([ANNECY])))
		expect(await findCities('74000')).toMatchObject({ genre: 'communes', codePostal: '74000' })
		expect(await findCities('Annecy')).not.toHaveProperty('codePostal')
	})

	test('un code postal est demandé avec une limite qui couvre ses communes', async () => {
		let requestValue: URL | undefined
		simulate(
			http.get(LIST, ({ request }) => {
				requestValue = new URL(request.url)
				return HttpResponse.json([])
			})
		)
		await findCities('62149')
		expect(requestValue?.searchParams.get('limit')).toBe(String(POSTAL_CODE_SUGGESTIONS_MAX))
		expect(POSTAL_CODE_SUGGESTIONS_MAX).toBeGreaterThan(SUGGESTIONS_MAX)
	})

	test('les codes postaux de la liste : triés, sans doublon, cinq chiffres seulement ; aucun si elle n’en donne pas', async () => {
		simulate(
			http.get(LIST, () =>
				HttpResponse.json([
					{ nom: 'Lille', code: '59350', codesPostaux: ['59800', '59000', '59000', '5900', 'abcde', '59260'] },
					{ nom: 'Annecy', code: '74010' },
				])
			)
		)
		const response = await findCities('Lil')
		if (response.genre !== 'communes') throw new Error('attendu : des communes')
		expect(response.communes.map(c => c.codesPostaux)).toEqual([['59000', '59260', '59800'], []])
	})

	test('toute la France : l’outre-mer et la Corse sont proposés, rien n’est filtré par département', async () => {
		simulate(
			http.get(LIST, () =>
				HttpResponse.json([
					{ nom: 'Saint-Denis', code: '97411', codeDepartement: '974' },
					{ nom: 'Papeete', code: '98735', codeDepartement: '987' },
					{ nom: 'Ajaccio', code: '2A004', codeDepartement: '2A' },
				])
			)
		)
		const response = await findCities('Saint')
		if (response.genre !== 'communes') throw new Error('attendu : des communes')
		expect(response.communes.map(suggestion).map(p => p.libelle)).toEqual([
			'Saint-Denis (974)',
			'Papeete (987)',
			'Ajaccio (2A)',
		])
	})

	test('un code que la collection refuserait, ou donné deux fois, n’est pas proposé', async () => {
		simulate(
			http.get(LIST, () =>
				HttpResponse.json([
					{ nom: 'Fictive', code: '99999' },
					{ nom: 'Annecy', code: '74010' },
					{ nom: 'Annecy', code: '74010' },
				])
			)
		)
		const response = await findCities('Annecy')
		if (response.genre !== 'communes') throw new Error('attendu : des communes')
		expect(response.communes.map(c => c.codeInsee)).toEqual(['74010'])
	})

	test('aucune commune ne correspond : une liste vide, pas une panne', async () => {
		simulate(http.get(LIST, () => HttpResponse.json([])))
		expect(await findCities('Zzzzz')).toEqual({ genre: 'communes', communes: [] })
	})

	test('une adresse ou un texte trop court ne fait aucune requête (une requête non déclarée ferait échouer le test)', async () => {
		expect(await findCities('12 rue des Lilas, 74000 Annecy')).toEqual({ genre: 'rien', motif: 'adresse' })
		expect(await findCities('A')).toEqual({ genre: 'rien', motif: 'trop-court' })
	})
})

describe('le service des communes en panne : une seule issue, « panne »', () => {
	test('une réponse 500', async () => {
		simulate(http.get(LIST, () => new HttpResponse(null, { status: 500 })))
		expect(await findCities('Annecy')).toEqual({ genre: 'panne' })
	})

	test('un statut 429 ou 503', async () => {
		for (const status of [429, 503]) {
			simulate(http.get(LIST, () => new HttpResponse(null, { status })))
			expect(await findCities('Annecy')).toEqual({ genre: 'panne' })
		}
	})

	test('un réseau coupé', async () => {
		simulate(http.get(LIST, () => HttpResponse.error()))
		expect(await findCities('Annecy')).toEqual({ genre: 'panne' })
	})

	test('une réponse qui n’est pas du JSON, ou pas une liste de communes', async () => {
		simulate(http.get(LIST, () => new HttpResponse('<html>maintenance</html>', { status: 200 })))
		expect(await findCities('Annecy')).toEqual({ genre: 'panne' })
		simulate(http.get(LIST, () => HttpResponse.json({ message: 'ok' })))
		expect(await findCities('Annecy')).toEqual({ genre: 'panne' })
		simulate(http.get(LIST, () => HttpResponse.json([{ nom: 'Annecy' }])))
		expect(await findCities('Annecy')).toEqual({ genre: 'panne' })
	})

	test(
		'un service muet : abandonné au bout du délai',
		async () => {
			simulate(
				http.get(LIST, async () => {
					await delay('infinite')
					return HttpResponse.json([ANNECY])
				})
			)
			const startedAt = Date.now()
			expect(await findCities('Annecy')).toEqual({ genre: 'panne' })
			expect(Date.now() - startedAt).toBeGreaterThanOrEqual(CITIES_DELAY_MS - 200)
		},
		CITIES_DELAY_MS + 3000
	)
})

describe('la commune d’un code', () => {
	test('74010 : le nom, le département et le centre de la liste', async () => {
		let requestValue: URL | undefined
		simulate(
			http.get(`${LIST}/74010`, ({ request }) => {
				requestValue = new URL(request.url)
				return HttpResponse.json(ANNECY)
			})
		)
		expect(await cityFromCode('74010')).toEqual({
			genre: 'commune',
			commune: {
				nom: 'Annecy',
				codeInsee: '74010',
				departement: '74',
				latitude: 45.9024,
				longitude: 6.1264,
				codesPostaux: ['74000'],
			},
		})
		expect(requestValue?.pathname).toBe('/communes/74010')
	})

	test('un code inconnu de la liste (404, corps en texte) est « inconnue », pas une panne', async () => {
		simulate(http.get(`${LIST}/74999`, () => new HttpResponse('Not Found', { status: 404 })))
		expect(await cityFromCode('74999')).toEqual({ genre: 'inconnue' })
	})

	test('un code mal formé n’est pas demandé', async () => {
		for (const code of ['', '7401', '../x', '20004', '74010/../x']) {
			expect(await cityFromCode(code)).toEqual({ genre: 'inconnue' })
		}
	})

	test('une panne, ou une réponse pour un autre code, est « panne » : rien n’est gardé de cette réponse', async () => {
		simulate(http.get(`${LIST}/74010`, () => new HttpResponse(null, { status: 502 })))
		expect(await cityFromCode('74010')).toEqual({ genre: 'panne' })
		simulate(http.get(`${LIST}/74010`, () => HttpResponse.json({ nom: 'Autre', code: '38185' })))
		expect(await cityFromCode('74010')).toEqual({ genre: 'panne' })
		simulate(http.get(`${LIST}/74010`, () => HttpResponse.error()))
		expect(await cityFromCode('74010')).toEqual({ genre: 'panne' })
	})
})
