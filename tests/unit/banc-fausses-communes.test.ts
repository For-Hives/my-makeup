import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { CITIES_ADDRESS, citiesAddress } from '@/lib/dashboard/city-reference'
import { creerFaussesCommunes } from '../outils/faux-communes/fournisseur'

/**
 * The fake list of the communes of the bench (CI of 15/10/2026): it answers the two questions of
 * the space as the official list does, so that the application of the end-to-end tests never calls
 * geo.api.gouv.fr. And the variable that points the application at it is refused anywhere else.
 */

const fournisseur = creerFaussesCommunes()
let serveur: ReturnType<typeof Bun.serve>
let adresse = ''

beforeAll(() => {
	serveur = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: requete => fournisseur.repondre(requete) })
	adresse = `http://127.0.0.1:${serveur.port}`
})
afterAll(() => serveur.stop(true))

const lire = async (chemin: string) => {
	const reponse = await fetch(`${adresse}${chemin}`)
	return {
		statut: reponse.status,
		corps: reponse.headers.get('content-type')?.includes('json') ? await reponse.json() : await reponse.text(),
	}
}

describe('la fausse liste des communes', () => {
	test('elle dit qui elle est', async () => {
		expect((await lire('/_sante')).corps).toEqual({ service: 'faux-communes' })
	})

	test('une recherche par nom : le nom exact d’abord, sans accent ni majuscule, bornée par limit, aux champs de la liste officielle', async () => {
		const { statut, corps } = await lire(
			'/communes?nom=lille&fields=nom,code,codeDepartement,centre&boost=population&limit=8'
		)
		expect(statut).toBe(200)
		expect((corps as { nom: string }[]).map(({ nom }) => nom)).toEqual(['Lille', 'Lillers', 'Lillebonne'])
		expect((corps as unknown[])[0]).toEqual({
			nom: 'Lille',
			code: '59350',
			codeDepartement: '59',
			centre: { type: 'Point', coordinates: [3.0465, 50.6311] },
		})
		expect(((await lire('/communes?nom=lille&limit=1')).corps as unknown[]).length).toBe(1)
		expect(((await lire('/communes?nom=THONON LES BAINS')).corps as { code: string }[])[0]?.code).toBe('74281')
		expect((await lire('/communes?nom=Atlantide')).corps).toEqual([])
	})

	test('une recherche par code postal, et une commune par son code INSEE ; un code inconnu : 404 en texte', async () => {
		expect(((await lire('/communes?codePostal=74000')).corps as { nom: string }[]).map(({ nom }) => nom)).toEqual([
			'Annecy',
		])
		expect((await lire('/communes/74010?fields=nom,code,codeDepartement,centre')).corps).toMatchObject({
			nom: 'Annecy',
			code: '74010',
		})
		expect(await lire('/communes/99999')).toEqual({ statut: 404, corps: 'Not Found' })
		expect((await lire('/dashboard')).statut).toBe(404)
	})
})

describe('l’application ne demande la fausse liste que sur ce poste, quand le banc la lui donne', () => {
	test('sans COMMUNES_DU_BANC, la liste officielle', () => {
		expect(citiesAddress({})).toBe(CITIES_ADDRESS)
		expect(citiesAddress({ COMMUNES_DU_BANC: ' ' })).toBe(CITIES_ADDRESS)
	})

	test('l’adresse du banc, sur ce poste', () => {
		expect(
			citiesAddress({ COMMUNES_DU_BANC: 'http://127.0.0.1:2050', NEXT_PUBLIC_SITE_URL: 'http://localhost:3100' })
		).toBe('http://127.0.0.1:2050')
	})

	test.each([
		'https://geo.example.test',
		'http://192.168.1.20:2050',
		'http://127.0.0.1:2050/',
		'http://127.0.0.1:2050/communes',
		'http://127.0.0.1',
	])('refuse %s', valeur => {
		expect(() => citiesAddress({ COMMUNES_DU_BANC: valeur })).toThrow('COMMUNES_DU_BANC refusée')
	})

	test.each(['https://my-makeup.fr'])('refuse toute valeur sur %s', site => {
		expect(() => citiesAddress({ COMMUNES_DU_BANC: 'http://127.0.0.1:2050', NEXT_PUBLIC_SITE_URL: site })).toThrow(
			'un site déployé'
		)
	})
})
