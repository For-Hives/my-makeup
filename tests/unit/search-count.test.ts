import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
	departmentOfSearch,
	readSearchCount,
	SEARCH_COUNT_RETENTION_DAYS,
	searchCountDay,
	searchCountPurgeThreshold,
	UNKNOWN_DEPARTMENT,
} from '@/lib/search/count'
import { aggregateSearches, WeeklyStats } from '@/lib/weekly-stats'

/**
 * Issue 1002: the searches are counted by day, with no text. The count is three facts and a
 * closed list: a city or not, a result or not, the département the search points at.
 */

const read = (chemin: string) => readFileSync(new URL(`../../${chemin}`, import.meta.url), 'utf8')

describe('1002 : ce que le serveur accepte d’un compte', () => {
	test('trois faits et un département de la liste fermée', () => {
		expect(readSearchCount({ withCity: true, noResult: false, department: '74' })).toEqual({
			withCity: true,
			noResult: false,
			department: '74',
		})
		expect(readSearchCount({ withCity: false, noResult: true, department: UNKNOWN_DEPARTMENT })).toEqual({
			withCity: false,
			noResult: true,
			department: UNKNOWN_DEPARTMENT,
		})
	})

	test('un texte, une clé en plus ou un département hors liste est refusé', () => {
		const base = { withCity: true, noResult: false, department: '74' }
		expect(readSearchCount({ ...base, search: 'mariée' })).toBeUndefined()
		expect(readSearchCount({ ...base, department: 'Annecy' })).toBeUndefined()
		expect(readSearchCount({ ...base, department: '99' })).toBeUndefined()
		expect(readSearchCount({ ...base, withCity: 'oui' })).toBeUndefined()
		expect(readSearchCount({ withCity: true, noResult: false })).toBeUndefined()
		expect(readSearchCount(null)).toBeUndefined()
		expect(readSearchCount('74')).toBeUndefined()
	})

	test('le jour est celui de Paris, la conservation est de 400 jours', () => {
		expect(searchCountDay(new Date('2026-10-23T21:59:00Z'))).toBe('2026-10-23')
		expect(searchCountDay(new Date('2026-10-23T22:01:00Z'))).toBe('2026-10-24')
		const now = new Date('2027-01-01T00:00:00Z')
		expect(SEARCH_COUNT_RETENTION_DAYS).toBe(400)
		expect(searchCountPurgeThreshold(now).toISOString()).toBe('2025-11-27T00:00:00.000Z')
	})
})

describe('1002 : le département d’une recherche', () => {
	test('un seul département désigné donne son code, sinon « unknown »', () => {
		expect(departmentOfSearch('74', null)).toBe('74')
		expect(departmentOfSearch('Haute-Savoie', null)).toBe('74')
		expect(departmentOfSearch('74940 Annecy', null)).toBe('74')
		expect(departmentOfSearch('74, 69', null)).toBe(UNKNOWN_DEPARTMENT)
		expect(departmentOfSearch('', null)).toBe(UNKNOWN_DEPARTMENT)
		expect(departmentOfSearch('Genève', null)).toBe(UNKNOWN_DEPARTMENT)
	})

	test('une commune connue donne le département de la liste officielle', () => {
		expect(departmentOfSearch('Annecy', '74')).toBe('74')
		expect(departmentOfSearch('Annecy', 'xx')).toBe(UNKNOWN_DEPARTMENT)
		expect(departmentOfSearch('Annecy', null)).toBe(UNKNOWN_DEPARTMENT)
	})
})

describe('1002 : la route de statistiques', () => {
	const rows = [
		{ department: '74', total: 10, withCity: 8, noResult: 3 },
		{ department: '74', total: 5, withCity: 5, noResult: 0 },
		{ department: UNKNOWN_DEPARTMENT, total: 5, withCity: 0, noResult: 1 },
	]

	test('totaux, part sans résultat et détail par département', () => {
		expect(aggregateSearches(rows)).toEqual({
			total: 20,
			withCity: 13,
			noResult: 4,
			noResultShare: 0.2,
			byDepartment: { '74': { total: 15, noResult: 3 }, unknown: { total: 5, noResult: 1 } },
		})
	})

	test('sans aucune recherche : des zéros et une part « null », jamais NaN', () => {
		expect(aggregateSearches([])).toEqual({ total: 0, withCity: 0, noResult: 0, noResultShare: null, byDepartment: {} })
	})

	test('le schéma publié accepte la clé et refuse un champ en plus', () => {
		const shape = aggregateSearches(rows)
		const schema = WeeklyStats.shape.searches
		expect(schema?.safeParse(shape).success).toBe(true)
		expect(schema?.safeParse({ ...shape, text: 'mariée' }).success).toBe(false)
	})
})

describe('1002 : lecture du code', () => {
	test('le navigateur compte au même endroit que l’événement Umami, sans compter une opposition', () => {
		const pages = read('src/components/analytics/PageAnalytics.tsx')
		expect(pages).toContain('recordSearch(')
		expect(pages).toContain('analyticsRefused(')
		// One decision: the pagination and the back button are skipped for both.
		expect(pages.match(/shouldEmit\('search_submit'/g)?.length).toBe(1)
	})

	test('l’action serveur ne lit aucun texte et freine par adresse', () => {
		const action = read('src/app/(front)/(site)/search/actions.ts')
		expect(action).toContain('readSearchCount(')
		expect(action).toContain('mayCountSearch(')
		expect(read('src/lib/search/count-rate-limit.ts')).toContain('ipClient(')
		expect(action).not.toMatch(/FormData|searchParams/)
	})

	test('la page ne donne au navigateur que des faits : jamais les mots', () => {
		const page = read('src/app/(front)/(site)/search/page.tsx')
		const tag = page.match(/<SearchAnalytics[\s\S]*?\/>/)?.[0] ?? ''
		expect(tag).toContain('departement=')
		expect(tag).not.toMatch(/search=\{search\}|city=\{city\}|recherche=/)
	})

	test('la collection ne porte aucun champ de texte libre et personne ne l’écrit par l’API', () => {
		const collection = read('src/collections/SearchCounts.ts')
		expect(collection).not.toMatch(/type: '(text|textarea|richText|email|json|code)'/)
		expect(collection).toContain('create: () => false')
		expect(collection).toContain('update: () => false')
		expect(collection).toContain('delete: () => false')
	})
})
