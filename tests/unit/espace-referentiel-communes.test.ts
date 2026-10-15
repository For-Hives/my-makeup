import { describe, expect, test } from 'bun:test'
import {
	chercherDesCommunes,
	communeDuCode,
	DELAI_DES_COMMUNES_MS,
	PROPOSITIONS_MAX,
	proposition,
	questionDeLaRecherche,
} from '@/lib/espace/referentiel-communes'
import { delay, HttpResponse, http, simuler } from '../outils/http-sortant'

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
		expect(questionDeLaRecherche('  Annecy  ')).toEqual({ genre: 'nom', valeur: 'Annecy' })
		expect(questionDeLaRecherche('Saint   Denis')).toEqual({ genre: 'nom', valeur: 'Saint Denis' })
		expect(questionDeLaRecherche('74000')).toEqual({ genre: 'codePostal', valeur: '74000' })
		expect(questionDeLaRecherche('A')).toEqual({ genre: 'rien', motif: 'trop-court' })
		expect(questionDeLaRecherche('   ')).toEqual({ genre: 'rien', motif: 'trop-court' })
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
		expect(questionDeLaRecherche(texte)).toEqual({ genre: 'rien', motif: 'adresse' })
	})
})

describe('la recherche de communes', () => {
	test('Annecy : la commune, son code, son département, son libellé', async () => {
		let demande: URL | undefined
		simuler(
			http.get(LISTE, ({ request }) => {
				demande = new URL(request.url)
				return HttpResponse.json([ANNECY])
			})
		)

		const reponse = await chercherDesCommunes('Annecy')

		expect(reponse).toEqual({
			genre: 'communes',
			communes: [{ nom: 'Annecy', codeInsee: '74010', departement: '74', latitude: 45.9024, longitude: 6.1264 }],
		})
		if (reponse.genre !== 'communes') throw new Error('attendu : des communes')
		expect(reponse.communes.map(proposition)).toEqual([{ codeInsee: '74010', libelle: 'Annecy (74)' }])
		expect(demande?.searchParams.get('nom')).toBe('Annecy')
		expect(demande?.searchParams.get('limit')).toBe(String(PROPOSITIONS_MAX))
		// Nothing of the person goes with the question: no cookie, no account.
		expect([...(demande?.searchParams.keys() ?? [])].sort()).toEqual(['boost', 'fields', 'limit', 'nom'])
	})

	test('un code postal est demandé par son code postal', async () => {
		let demande: URL | undefined
		simuler(
			http.get(LISTE, ({ request }) => {
				demande = new URL(request.url)
				return HttpResponse.json([ANNECY])
			})
		)
		await chercherDesCommunes('74000')
		expect(demande?.searchParams.get('codePostal')).toBe('74000')
		expect(demande?.searchParams.has('nom')).toBe(false)
	})

	test('toute la France : l’outre-mer et la Corse sont proposés, rien n’est filtré par département', async () => {
		simuler(
			http.get(LISTE, () =>
				HttpResponse.json([
					{ nom: 'Saint-Denis', code: '97411', codeDepartement: '974' },
					{ nom: 'Papeete', code: '98735', codeDepartement: '987' },
					{ nom: 'Ajaccio', code: '2A004', codeDepartement: '2A' },
				])
			)
		)
		const reponse = await chercherDesCommunes('Saint')
		if (reponse.genre !== 'communes') throw new Error('attendu : des communes')
		expect(reponse.communes.map(proposition).map(p => p.libelle)).toEqual([
			'Saint-Denis (974)',
			'Papeete (987)',
			'Ajaccio (2A)',
		])
	})

	test('un code que la collection refuserait, ou donné deux fois, n’est pas proposé', async () => {
		simuler(
			http.get(LISTE, () =>
				HttpResponse.json([
					{ nom: 'Fictive', code: '99999' },
					{ nom: 'Annecy', code: '74010' },
					{ nom: 'Annecy', code: '74010' },
				])
			)
		)
		const reponse = await chercherDesCommunes('Annecy')
		if (reponse.genre !== 'communes') throw new Error('attendu : des communes')
		expect(reponse.communes.map(c => c.codeInsee)).toEqual(['74010'])
	})

	test('aucune commune ne correspond : une liste vide, pas une panne', async () => {
		simuler(http.get(LISTE, () => HttpResponse.json([])))
		expect(await chercherDesCommunes('Zzzzz')).toEqual({ genre: 'communes', communes: [] })
	})

	test('une adresse ou un texte trop court ne fait aucune requête (une requête non déclarée ferait échouer le test)', async () => {
		expect(await chercherDesCommunes('12 rue des Lilas, 74000 Annecy')).toEqual({ genre: 'rien', motif: 'adresse' })
		expect(await chercherDesCommunes('A')).toEqual({ genre: 'rien', motif: 'trop-court' })
	})
})

describe('le service des communes en panne : une seule issue, « panne »', () => {
	test('une réponse 500', async () => {
		simuler(http.get(LISTE, () => new HttpResponse(null, { status: 500 })))
		expect(await chercherDesCommunes('Annecy')).toEqual({ genre: 'panne' })
	})

	test('un statut 429 ou 503', async () => {
		for (const status of [429, 503]) {
			simuler(http.get(LISTE, () => new HttpResponse(null, { status })))
			expect(await chercherDesCommunes('Annecy')).toEqual({ genre: 'panne' })
		}
	})

	test('un réseau coupé', async () => {
		simuler(http.get(LISTE, () => HttpResponse.error()))
		expect(await chercherDesCommunes('Annecy')).toEqual({ genre: 'panne' })
	})

	test('une réponse qui n’est pas du JSON, ou pas une liste de communes', async () => {
		simuler(http.get(LISTE, () => new HttpResponse('<html>maintenance</html>', { status: 200 })))
		expect(await chercherDesCommunes('Annecy')).toEqual({ genre: 'panne' })
		simuler(http.get(LISTE, () => HttpResponse.json({ message: 'ok' })))
		expect(await chercherDesCommunes('Annecy')).toEqual({ genre: 'panne' })
		simuler(http.get(LISTE, () => HttpResponse.json([{ nom: 'Annecy' }])))
		expect(await chercherDesCommunes('Annecy')).toEqual({ genre: 'panne' })
	})

	test(
		'un service muet : abandonné au bout du délai',
		async () => {
			simuler(
				http.get(LISTE, async () => {
					await delay('infinite')
					return HttpResponse.json([ANNECY])
				})
			)
			const debut = Date.now()
			expect(await chercherDesCommunes('Annecy')).toEqual({ genre: 'panne' })
			expect(Date.now() - debut).toBeGreaterThanOrEqual(DELAI_DES_COMMUNES_MS - 200)
		},
		DELAI_DES_COMMUNES_MS + 3000
	)
})

describe('la commune d’un code', () => {
	test('74010 : le nom, le département et le centre de la liste', async () => {
		let demande: URL | undefined
		simuler(
			http.get(`${LISTE}/74010`, ({ request }) => {
				demande = new URL(request.url)
				return HttpResponse.json(ANNECY)
			})
		)
		expect(await communeDuCode('74010')).toEqual({
			genre: 'commune',
			commune: { nom: 'Annecy', codeInsee: '74010', departement: '74', latitude: 45.9024, longitude: 6.1264 },
		})
		expect(demande?.pathname).toBe('/communes/74010')
	})

	test('un code inconnu de la liste (404, corps en texte) est « inconnue », pas une panne', async () => {
		simuler(http.get(`${LISTE}/74999`, () => new HttpResponse('Not Found', { status: 404 })))
		expect(await communeDuCode('74999')).toEqual({ genre: 'inconnue' })
	})

	test('un code mal formé n’est pas demandé', async () => {
		for (const code of ['', '7401', '../x', '20004', '74010/../x']) {
			expect(await communeDuCode(code)).toEqual({ genre: 'inconnue' })
		}
	})

	test('une panne, ou une réponse pour un autre code, est « panne » : rien n’est gardé de cette réponse', async () => {
		simuler(http.get(`${LISTE}/74010`, () => new HttpResponse(null, { status: 502 })))
		expect(await communeDuCode('74010')).toEqual({ genre: 'panne' })
		simuler(http.get(`${LISTE}/74010`, () => HttpResponse.json({ nom: 'Autre', code: '38185' })))
		expect(await communeDuCode('74010')).toEqual({ genre: 'panne' })
		simuler(http.get(`${LISTE}/74010`, () => HttpResponse.error()))
		expect(await communeDuCode('74010')).toEqual({ genre: 'panne' })
	})
})
