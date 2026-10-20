import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { GET, POST } from '@/app/api/stats/weekly/route'
import { WeeklyStats } from '@/lib/weekly-stats'
import { DEMO_PROFILES } from '../../src/demo-data/profiles'
import { DATASET_ACCOUNTS, DATASET_TYPES } from '../fixtures/accounts'
import { setBenchDataset } from '../fixtures/bench-dataset'
import { ACCOUNT_TYPES } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'
import { emptyStorage } from '../support/s3'

/**
 * Ticket 149 (plan 04 §3.6, RESTE MES-20): GET /api/stats/weekly on the set of the bench. Exact
 * counts, derived from what the set promises of each profile, nothing personal in the answer, and
 * the token opens this route and no other.
 */

const TOKEN = 'jeton-de-service-du-banc-0123456789abcdef'
const WEEK = 'from=2020-01-01T00:00:00Z&to=2020-01-08T00:00:00Z'
const HEADERS = { authorization: `Bearer ${TOKEN}` }
const before = process.env.STATS_TOKEN

const call = (requete: string, entetes: Record<string, string> = HEADERS) =>
	GET(new Request(`http://localhost/api/stats/weekly?${requete}`, { headers: entetes }))

beforeAll(async () => {
	process.env.STATS_TOKEN = TOKEN
	await testPayload()
	await Promise.all([emptyBase(), emptyStorage()])
	await setBenchDataset()
}, 120_000)

afterAll(async () => {
	if (before === undefined) delete process.env.STATS_TOKEN
	else process.env.STATS_TOKEN = before
	await Promise.all([emptyBase(), emptyStorage()])
}, 60_000)

describe('Les statistiques hebdomadaires sur le jeu du banc', () => {
	test('les nombres exacts, tirés de ce que le jeu promet de chaque profil', async () => {
		const accountsProfiles = DATASET_TYPES.filter(type => ACCOUNT_TYPES[type].collection === 'pros').length
		const withoutProfile = DATASET_TYPES.filter(type => type === 'maquilleuse-sans-profil').length
		const types = DEMO_PROFILES
		const seenByServer = types.filter(({ attendu }) => attendu.status === 'published' && attendu.publishable)

		const response = await call(WEEK)
		const stats = WeeklyStats.parse(await response.json())

		expect(response.status).toBe(200)
		expect(stats.accounts.total).toBe(types.length + accountsProfiles)
		// Every account of makeup artist but the one without profile has an empty profile, created with it.
		const emptyAccounts = accountsProfiles - withoutProfile
		expect(stats.profiles.total).toBe(types.length + emptyAccounts)
		expect(stats.profiles.fullyEmpty).toBe(types.filter(({ attendu }) => attendu.fullyEmpty).length + emptyAccounts)
		expect(stats.profiles.active).toBe(types.filter(({ attendu }) => attendu.active).length)
		expect(stats.profiles.publishable).toBe(seenByServer.length)
		expect(stats.profiles.hidden).toBe(types.filter(({ attendu }) => attendu.status === 'hidden').length)
		expect(stats.publishable.slugs).toEqual(seenByServer.map(({ attendu }) => attendu.slug).sort())
		expect(Object.values(stats.publishable.byDepartment).reduce((a, b) => a + b, 0)).toBe(seenByServer.length)
		// The set was created now: nothing in 2020.
		expect(stats.profiles.created).toBe(0)
		expect(stats.accounts.new).toBe(0)
		expect(stats.signUps).toEqual([])
		expect(stats.cohort).toEqual({ profiles: 0, active: 0 })
		expect(Object.keys(DATASET_ACCOUNTS).length).toBeGreaterThan(0)
	}, 60_000)

	test('une période qui contient la création : les inscriptions et les comptes nouveaux', async () => {
		const start = new Date(Date.now() - 3_600_000).toISOString()
		const end = new Date(Date.now() + 3_600_000).toISOString()
		const stats = WeeklyStats.parse(await (await call(`from=${start}&to=${end}`)).json())

		expect(stats.profiles.created).toBe(stats.profiles.total)
		expect(stats.signUps).toHaveLength(stats.profiles.total)
		expect(stats.accounts.new).toBe(stats.accounts.total)
	}, 60_000)

	test('ni « @ », ni 9 chiffres, ni nom du jeu hors de la liste des adresses publiques', async () => {
		const stats = WeeklyStats.parse(await (await call(WEEK)).json())
		const withoutUrls = JSON.stringify({ ...stats, publishable: { ...stats.publishable, slugs: [] } })
		const names = DEMO_PROFILES.flatMap(({ profil, compte }) => [
			profil.firstName,
			profil.lastName,
			profil.artistName,
			compte.nom,
			profil.contactDetails?.phone,
			profil.contactDetails?.email,
			profil.city?.name,
		]).filter((nom): nom is string => typeof nom === 'string' && nom !== '')

		expect(withoutUrls).not.toContain('@')
		expect(withoutUrls).not.toMatch(/\d{9}/)
		expect(names.length).toBeGreaterThan(10)
		for (const name of names) expect(withoutUrls.toLowerCase()).not.toContain(name.toLowerCase())
	}, 60_000)

	test('401 sans jeton ou avec un mauvais, 400 sur une période illisible, 405 sur un autre verbe, jamais en cache', async () => {
		for (const headers of [{}, { authorization: 'Bearer faux' }, { authorization: TOKEN }] as Record<
			string,
			string
		>[]) {
			const response = await call(WEEK, headers)
			expect(response.status).toBe(401)
			expect(response.headers.get('Cache-Control')).toBe('no-store')
		}
		for (const request of ['', 'from=2020-01-01&to=2020-01-08', 'from=2020-01-08T00:00:00Z&to=2020-01-01T00:00:00Z']) {
			const response = await call(request)
			expect(response.status).toBe(400)
			expect(response.headers.get('Cache-Control')).toBe('no-store')
		}
		expect(POST().status).toBe(405)
		expect((await call(WEEK)).headers.get('Cache-Control')).toBe('no-store')
	}, 60_000)

	test('le jeton ne vaut rien sur une autre route : l’API de Payload le lit comme une visiteuse', async () => {
		const profiles = await callRest('GET', '/api/profiles?limit=100', { enTetes: HEADERS })
		const anonymous = await callRest('GET', '/api/profiles?limit=100')
		expect(profiles.statut).toBe(anonymous.statut)
		expect(profiles.texte).toBe(anonymous.texte)
		const accounts = await callRest('GET', '/api/pros', { enTetes: HEADERS })
		expect(accounts.statut).toBe(403)
	}, 60_000)
})
