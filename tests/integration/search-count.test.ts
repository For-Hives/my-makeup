import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { GET } from '@/app/api/stats/weekly/route'
import { recordSearchCount, SEARCH_COUNT_COLLECTION, searchCountDay } from '@/lib/search/count'
import { purgeSearchCounts } from '@/lib/tasks/search-counts'
import { WeeklyStats } from '@/lib/weekly-stats'
import { emptyBase, testPayload } from '../support/payload-test'

/**
 * Issue 1002: the searches counted by day. Concurrent counts add up (no lost update), the row has numbers
 * and a code only, the statistics route gives the exact totals and the share without result, and the daily
 * task deletes the rows past 400 days.
 */

const TOKEN = 'jeton-de-service-du-banc-0123456789abcdef'
const before = process.env.STATS_TOKEN

const NOW = new Date()

beforeAll(async () => {
	process.env.STATS_TOKEN = TOKEN
	await emptyBase()
})

afterAll(() => {
	if (before === undefined) delete process.env.STATS_TOKEN
	else process.env.STATS_TOKEN = before
})

describe('1002 : le compteur de recherches', () => {
	test('vingt comptes en même temps font vingt, sur une seule ligne par jour et département', async () => {
		const payload = await testPayload()
		await Promise.all(
			Array.from({ length: 20 }, (_, i) =>
				recordSearchCount(payload, { withCity: i < 12, noResult: i < 5, department: '74' }, NOW)
			)
		)
		await recordSearchCount(payload, { withCity: false, noResult: true, department: 'unknown' }, NOW)
		const { docs } = await payload.find({
			collection: SEARCH_COUNT_COLLECTION,
			pagination: false,
			overrideAccess: true,
		})
		const row = docs.find(doc => doc.department === '74')
		expect(docs).toHaveLength(2)
		expect([Number(row?.total), Number(row?.withCity), Number(row?.noResult)]).toEqual([20, 12, 5])
		// Numbers and a code of the list: nothing that was typed can be in a row.
		expect(Object.keys(row ?? {}).sort()).toEqual(['day', 'department', 'id', 'noResult', 'total', 'withCity'])
		expect(String(row?.day).slice(0, 10)).toBe(searchCountDay(NOW))
	})

	test('la route de statistiques donne les totaux exacts et la part sans résultat', async () => {
		const from = new Date(NOW.getTime() - 3 * 86_400_000)
		const to = new Date(NOW.getTime() + 2 * 86_400_000)
		const response = await GET(
			new Request(`http://localhost/api/stats/weekly?from=${from.toISOString()}&to=${to.toISOString()}`, {
				headers: { authorization: `Bearer ${TOKEN}` },
			})
		)
		expect(response.status).toBe(200)
		const stats = WeeklyStats.parse(await response.json())
		expect(stats.searches).toEqual({
			total: 21,
			withCity: 12,
			noResult: 6,
			noResultShare: 0.286,
			byDepartment: { '74': { total: 20, noResult: 5 }, unknown: { total: 1, noResult: 1 } },
		})
	})

	test('la tâche quotidienne supprime les lignes de plus de 400 jours et garde les autres', async () => {
		const payload = await testPayload()
		const old = new Date(NOW.getTime() - 401 * 86_400_000)
		const kept = new Date(NOW.getTime() - 399 * 86_400_000)
		await recordSearchCount(payload, { withCity: true, noResult: false, department: '69' }, old)
		await recordSearchCount(payload, { withCity: true, noResult: false, department: '69' }, kept)
		const deleted = await purgeSearchCounts.executer(payload, NOW)
		expect(deleted).toBe(1)
		const { docs } = await payload.find({
			collection: SEARCH_COUNT_COLLECTION,
			where: { department: { equals: '69' } },
			overrideAccess: true,
		})
		expect(docs).toHaveLength(1)
		expect(String(docs[0]?.day).slice(0, 10)).toBe(searchCountDay(kept))
		// Idempotent: a second run has nothing left to remove.
		expect(await purgeSearchCounts.executer(payload, NOW)).toBe(0)
	})
})
