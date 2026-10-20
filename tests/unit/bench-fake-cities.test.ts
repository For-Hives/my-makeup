import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { CITIES_ADDRESS, citiesAddress } from '@/lib/dashboard/city-reference'
import { createFakeCities } from '../support/fake-cities/provider'

/**
 * The fake list of the communes of the bench (CI of 15/10/2026): it answers the two questions of
 * the space as the official list does, so that the application of the end-to-end tests never calls
 * geo.api.gouv.fr. And the variable that points the application at it is refused anywhere else.
 */

const provider = createFakeCities()
let server: ReturnType<typeof Bun.serve>
let url = ''

beforeAll(() => {
	server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: requete => provider.repondre(requete) })
	url = `http://127.0.0.1:${server.port}`
})
afterAll(() => server.stop(true))

const read = async (chemin: string) => {
	const response = await fetch(`${url}${chemin}`)
	return {
		statut: response.status,
		corps: response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text(),
	}
}

describe('la fausse liste des communes', () => {
	test('elle dit qui elle est', async () => {
		expect((await read('/_sante')).corps).toEqual({ service: 'fake-cities' })
	})

	test('une recherche par nom : le nom exact d’abord, sans accent ni majuscule, bornée par limit, aux champs de la liste officielle', async () => {
		const { statut: status, corps } = await read(
			'/communes?nom=lille&fields=nom,code,codeDepartement,centre&boost=population&limit=8'
		)
		expect(status).toBe(200)
		expect((corps as { nom: string }[]).map(({ nom }) => nom)).toEqual(['Lille', 'Lillers', 'Lillebonne'])
		expect((corps as unknown[])[0]).toEqual({
			nom: 'Lille',
			code: '59350',
			codeDepartement: '59',
			centre: { type: 'Point', coordinates: [3.0465, 50.6311] },
		})
		expect(((await read('/communes?nom=lille&limit=1')).corps as unknown[]).length).toBe(1)
		expect(((await read('/communes?nom=THONON LES BAINS')).corps as { code: string }[])[0]?.code).toBe('74281')
		expect((await read('/communes?nom=Atlantide')).corps).toEqual([])
	})

	test('une recherche par code postal, et une commune par son code INSEE ; un code inconnu : 404 en texte', async () => {
		expect(((await read('/communes?codePostal=74000')).corps as { nom: string }[]).map(({ nom }) => nom)).toEqual([
			'Annecy',
		])
		expect((await read('/communes/74010?fields=nom,code,codeDepartement,centre')).corps).toMatchObject({
			nom: 'Annecy',
			code: '74010',
		})
		expect(await read('/communes/99999')).toEqual({ statut: 404, corps: 'Not Found' })
		expect((await read('/dashboard')).statut).toBe(404)
	})
})

describe('l’application ne demande la fausse liste que sur ce poste, quand le banc la lui donne', () => {
	test('sans BENCH_CITIES, la liste officielle', () => {
		expect(citiesAddress({})).toBe(CITIES_ADDRESS)
		expect(citiesAddress({ BENCH_CITIES: ' ' })).toBe(CITIES_ADDRESS)
	})

	test('l’adresse du banc, sur ce poste', () => {
		expect(
			citiesAddress({ BENCH_CITIES: 'http://127.0.0.1:2050', NEXT_PUBLIC_SITE_URL: 'http://localhost:3100' })
		).toBe('http://127.0.0.1:2050')
	})

	test.each([
		'https://geo.example.test',
		'http://192.168.1.20:2050',
		'http://127.0.0.1:2050/',
		'http://127.0.0.1:2050/communes',
		'http://127.0.0.1',
	])('refuse %s', valeur => {
		expect(() => citiesAddress({ BENCH_CITIES: valeur })).toThrow('BENCH_CITIES refusée')
	})

	test.each(['https://my-makeup.fr'])('refuse toute valeur sur %s', site => {
		expect(() => citiesAddress({ BENCH_CITIES: 'http://127.0.0.1:2050', NEXT_PUBLIC_SITE_URL: site })).toThrow(
			'un site déployé'
		)
	})
})
