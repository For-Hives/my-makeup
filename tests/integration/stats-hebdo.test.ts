import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { GET, POST } from '@/app/api/stats/weekly/route'
import { StatsHebdo } from '@/lib/stats-hebdo'
import { PROFILS_DU_JEU } from '../../src/jeu-fictif/profils'
import { COMPTES_DU_JEU, TYPES_DU_JEU } from '../fixtures/comptes'
import { poserLeJeuDuBanc } from '../fixtures/jeu-du-banc'
import { TYPES_DE_COMPTE } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest } from '../outils/rest'
import { viderLeStockage } from '../outils/s3'

/**
 * Ticket 149 (plan 04 §3.6, RESTE MES-20): GET /api/stats/weekly on the set of the bench. Exact
 * counts, derived from what the set promises of each profile, nothing personal in the answer, and
 * the token opens this route and no other.
 */

const JETON = 'jeton-de-service-du-banc-0123456789abcdef'
const SEMAINE = 'from=2020-01-01T00:00:00Z&to=2020-01-08T00:00:00Z'
const ENTETES = { authorization: `Bearer ${JETON}` }
const avant = process.env.STATS_TOKEN

const appeler = (requete: string, entetes: Record<string, string> = ENTETES) =>
	GET(new Request(`http://localhost/api/stats/weekly?${requete}`, { headers: entetes }))

beforeAll(async () => {
	process.env.STATS_TOKEN = JETON
	await payloadDeTest()
	await Promise.all([viderLaBase(), viderLeStockage()])
	await poserLeJeuDuBanc()
}, 120_000)

afterAll(async () => {
	if (avant === undefined) delete process.env.STATS_TOKEN
	else process.env.STATS_TOKEN = avant
	await Promise.all([viderLaBase(), viderLeStockage()])
}, 60_000)

describe('Les statistiques hebdomadaires sur le jeu du banc', () => {
	test('les nombres exacts, tirés de ce que le jeu promet de chaque profil', async () => {
		const profilsDesComptes = TYPES_DU_JEU.filter(type => TYPES_DE_COMPTE[type].collection === 'pros').length
		const sansProfil = TYPES_DU_JEU.filter(type => type === 'maquilleuse-sans-profil').length
		const types = PROFILS_DU_JEU
		const vusParLeServeur = types.filter(({ attendu }) => attendu.status === 'published' && attendu.publishable)

		const reponse = await appeler(SEMAINE)
		const stats = StatsHebdo.parse(await reponse.json())

		expect(reponse.status).toBe(200)
		expect(stats.comptes.total).toBe(types.length + profilsDesComptes)
		// Every account of makeup artist but the one without profile has an empty profile, created with it.
		const videsDesComptes = profilsDesComptes - sansProfil
		expect(stats.profils.total).toBe(types.length + videsDesComptes)
		expect(stats.profils.entierementVides).toBe(
			types.filter(({ attendu }) => attendu.fullyEmpty).length + videsDesComptes
		)
		expect(stats.profils.actifs).toBe(types.filter(({ attendu }) => attendu.active).length)
		expect(stats.profils.publiables).toBe(vusParLeServeur.length)
		expect(stats.profils.masques).toBe(types.filter(({ attendu }) => attendu.status === 'hidden').length)
		expect(stats.publiables.slugs).toEqual(vusParLeServeur.map(({ attendu }) => attendu.slug).sort())
		expect(Object.values(stats.publiables.parDepartement).reduce((a, b) => a + b, 0)).toBe(vusParLeServeur.length)
		// The set was created now: nothing in 2020.
		expect(stats.profils.crees).toBe(0)
		expect(stats.comptes.nouveaux).toBe(0)
		expect(stats.inscriptions).toEqual([])
		expect(stats.cohorte).toEqual({ profils: 0, actifs: 0 })
		expect(Object.keys(COMPTES_DU_JEU).length).toBeGreaterThan(0)
	}, 60_000)

	test('une période qui contient la création : les inscriptions et les comptes nouveaux', async () => {
		const debut = new Date(Date.now() - 3_600_000).toISOString()
		const fin = new Date(Date.now() + 3_600_000).toISOString()
		const stats = StatsHebdo.parse(await (await appeler(`from=${debut}&to=${fin}`)).json())

		expect(stats.profils.crees).toBe(stats.profils.total)
		expect(stats.inscriptions).toHaveLength(stats.profils.total)
		expect(stats.comptes.nouveaux).toBe(stats.comptes.total)
	}, 60_000)

	test('ni « @ », ni 9 chiffres, ni nom du jeu hors de la liste des adresses publiques', async () => {
		const stats = StatsHebdo.parse(await (await appeler(SEMAINE)).json())
		const sansAdresses = JSON.stringify({ ...stats, publiables: { ...stats.publiables, slugs: [] } })
		const noms = PROFILS_DU_JEU.flatMap(({ profil, compte }) => [
			profil.firstName,
			profil.lastName,
			profil.artistName,
			compte.nom,
			profil.contactDetails?.phone,
			profil.contactDetails?.email,
			profil.city?.name,
		]).filter((nom): nom is string => typeof nom === 'string' && nom !== '')

		expect(sansAdresses).not.toContain('@')
		expect(sansAdresses).not.toMatch(/\d{9}/)
		expect(noms.length).toBeGreaterThan(10)
		for (const nom of noms) expect(sansAdresses.toLowerCase()).not.toContain(nom.toLowerCase())
	}, 60_000)

	test('401 sans jeton ou avec un mauvais, 400 sur une période illisible, 405 sur un autre verbe, jamais en cache', async () => {
		for (const entetes of [{}, { authorization: 'Bearer faux' }, { authorization: JETON }] as Record<
			string,
			string
		>[]) {
			const reponse = await appeler(SEMAINE, entetes)
			expect(reponse.status).toBe(401)
			expect(reponse.headers.get('Cache-Control')).toBe('no-store')
		}
		for (const requete of ['', 'from=2020-01-01&to=2020-01-08', 'from=2020-01-08T00:00:00Z&to=2020-01-01T00:00:00Z']) {
			const reponse = await appeler(requete)
			expect(reponse.status).toBe(400)
			expect(reponse.headers.get('Cache-Control')).toBe('no-store')
		}
		expect(POST().status).toBe(405)
		expect((await appeler(SEMAINE)).headers.get('Cache-Control')).toBe('no-store')
	}, 60_000)

	test('le jeton ne vaut rien sur une autre route : l’API de Payload le lit comme une visiteuse', async () => {
		const profils = await appelerRest('GET', '/api/profiles?limit=100', { enTetes: ENTETES })
		const anonyme = await appelerRest('GET', '/api/profiles?limit=100')
		expect(profils.statut).toBe(anonyme.statut)
		expect(profils.texte).toBe(anonyme.texte)
		const comptes = await appelerRest('GET', '/api/pros', { enTetes: ENTETES })
		expect(comptes.statut).toBe(403)
	}, 60_000)
})
