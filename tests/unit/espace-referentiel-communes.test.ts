import { describe, expect, test } from 'bun:test'
import {
	CITIES_DELAY_MS,
	cityFromCode,
	findCities,
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

const LISTE = 'https://geo.api.gouv.fr/communes'
const ANNECY = {
	nom: 'Annecy',
	code: '74010',
	codeDepartement: '74',
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
		let demande: URL | undefined
		simulate(
			http.get(LISTE, ({ request }) => {
				demande = new URL(request.url)
				return HttpResponse.json([ANNECY])
			})
		)

		const reponse = await findCities('Annecy')

		expect(reponse).toEqual({
			genre: 'communes',
			communes: [{ nom: 'Annecy', codeInsee: '74010', departement: '74', latitude: 45.9024, longitude: 6.1264 }],
		})
		if (reponse.genre !== 'communes') throw new Error('attendu : des communes')
		expect(reponse.communes.map(suggestion)).toEqual([{ codeInsee: '74010', libelle: 'Annecy (74)' }])
		expect(demande?.searchParams.get('nom')).toBe('Annecy')
		expect(demande?.searchParams.get('limit')).toBe(String(SUGGESTIONS_MAX))
		// Nothing of the person goes with the question: no cookie, no account.
		expect([...(demande?.searchParams.keys() ?? [])].sort()).toEqual(['boost', 'fields', 'limit', 'nom'])
	})

	test('un code postal est demandé par son code postal', async () => {
		let demande: URL | undefined
		simulate(
			http.get(LISTE, ({ request }) => {
				demande = new URL(request.url)
				return HttpResponse.json([ANNECY])
			})
		)
		await findCities('74000')
		expect(demande?.searchParams.get('codePostal')).toBe('74000')
		expect(demande?.searchParams.has('nom')).toBe(false)
	})

	test('toute la France : l’outre-mer et la Corse sont proposés, rien n’est filtré par département', async () => {
		simulate(
			http.get(LISTE, () =>
				HttpResponse.json([
					{ nom: 'Saint-Denis', code: '97411', codeDepartement: '974' },
					{ nom: 'Papeete', code: '98735', codeDepartement: '987' },
					{ nom: 'Ajaccio', code: '2A004', codeDepartement: '2A' },
				])
			)
		)
		const reponse = await findCities('Saint')
		if (reponse.genre !== 'communes') throw new Error('attendu : des communes')
		expect(reponse.communes.map(suggestion).map(p => p.libelle)).toEqual([
			'Saint-Denis (974)',
			'Papeete (987)',
			'Ajaccio (2A)',
		])
	})

	test('un code que la collection refuserait, ou donné deux fois, n’est pas proposé', async () => {
		simulate(
			http.get(LISTE, () =>
				HttpResponse.json([
					{ nom: 'Fictive', code: '99999' },
					{ nom: 'Annecy', code: '74010' },
					{ nom: 'Annecy', code: '74010' },
				])
			)
		)
		const reponse = await findCities('Annecy')
		if (reponse.genre !== 'communes') throw new Error('attendu : des communes')
		expect(reponse.communes.map(c => c.codeInsee)).toEqual(['74010'])
	})

	test('aucune commune ne correspond : une liste vide, pas une panne', async () => {
		simulate(http.get(LISTE, () => HttpResponse.json([])))
		expect(await findCities('Zzzzz')).toEqual({ genre: 'communes', communes: [] })
	})

	test('une adresse ou un texte trop court ne fait aucune requête (une requête non déclarée ferait échouer le test)', async () => {
		expect(await findCities('12 rue des Lilas, 74000 Annecy')).toEqual({ genre: 'rien', motif: 'adresse' })
		expect(await findCities('A')).toEqual({ genre: 'rien', motif: 'trop-court' })
	})
})

describe('le service des communes en panne : une seule issue, « panne »', () => {
	test('une réponse 500', async () => {
		simulate(http.get(LISTE, () => new HttpResponse(null, { status: 500 })))
		expect(await findCities('Annecy')).toEqual({ genre: 'panne' })
	})

	test('un statut 429 ou 503', async () => {
		for (const status of [429, 503]) {
			simulate(http.get(LISTE, () => new HttpResponse(null, { status })))
			expect(await findCities('Annecy')).toEqual({ genre: 'panne' })
		}
	})

	test('un réseau coupé', async () => {
		simulate(http.get(LISTE, () => HttpResponse.error()))
		expect(await findCities('Annecy')).toEqual({ genre: 'panne' })
	})

	test('une réponse qui n’est pas du JSON, ou pas une liste de communes', async () => {
		simulate(http.get(LISTE, () => new HttpResponse('<html>maintenance</html>', { status: 200 })))
		expect(await findCities('Annecy')).toEqual({ genre: 'panne' })
		simulate(http.get(LISTE, () => HttpResponse.json({ message: 'ok' })))
		expect(await findCities('Annecy')).toEqual({ genre: 'panne' })
		simulate(http.get(LISTE, () => HttpResponse.json([{ nom: 'Annecy' }])))
		expect(await findCities('Annecy')).toEqual({ genre: 'panne' })
	})

	test(
		'un service muet : abandonné au bout du délai',
		async () => {
			simulate(
				http.get(LISTE, async () => {
					await delay('infinite')
					return HttpResponse.json([ANNECY])
				})
			)
			const debut = Date.now()
			expect(await findCities('Annecy')).toEqual({ genre: 'panne' })
			expect(Date.now() - debut).toBeGreaterThanOrEqual(CITIES_DELAY_MS - 200)
		},
		CITIES_DELAY_MS + 3000
	)
})

describe('la commune d’un code', () => {
	test('74010 : le nom, le département et le centre de la liste', async () => {
		let demande: URL | undefined
		simulate(
			http.get(`${LISTE}/74010`, ({ request }) => {
				demande = new URL(request.url)
				return HttpResponse.json(ANNECY)
			})
		)
		expect(await cityFromCode('74010')).toEqual({
			genre: 'commune',
			commune: { nom: 'Annecy', codeInsee: '74010', departement: '74', latitude: 45.9024, longitude: 6.1264 },
		})
		expect(demande?.pathname).toBe('/communes/74010')
	})

	test('un code inconnu de la liste (404, corps en texte) est « inconnue », pas une panne', async () => {
		simulate(http.get(`${LISTE}/74999`, () => new HttpResponse('Not Found', { status: 404 })))
		expect(await cityFromCode('74999')).toEqual({ genre: 'inconnue' })
	})

	test('un code mal formé n’est pas demandé', async () => {
		for (const code of ['', '7401', '../x', '20004', '74010/../x']) {
			expect(await cityFromCode(code)).toEqual({ genre: 'inconnue' })
		}
	})

	test('une panne, ou une réponse pour un autre code, est « panne » : rien n’est gardé de cette réponse', async () => {
		simulate(http.get(`${LISTE}/74010`, () => new HttpResponse(null, { status: 502 })))
		expect(await cityFromCode('74010')).toEqual({ genre: 'panne' })
		simulate(http.get(`${LISTE}/74010`, () => HttpResponse.json({ nom: 'Autre', code: '38185' })))
		expect(await cityFromCode('74010')).toEqual({ genre: 'panne' })
		simulate(http.get(`${LISTE}/74010`, () => HttpResponse.error()))
		expect(await cityFromCode('74010')).toEqual({ genre: 'panne' })
	})
})
