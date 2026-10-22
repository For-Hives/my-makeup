import { describe, expect, test } from 'bun:test'
import {
	annotations,
	BLOCKING_FROM,
	budgetsAt,
	evaluate,
	exitCode,
	modeAt,
	STRICT_PERFORMANCE_FROM,
} from '../../scripts/perf/ci-gate'
import { type PageResult, PLAN_PAGES, type Run } from '../../scripts/perf/lighthouse-measure'

/**
 * Issue 984: the CI measures the four reference pages and judges them with the budgets of plan 02 §7.5, in warning
 * for two weeks and then in error. Nothing here runs Lighthouse: the runs are made up.
 */

const good = (surcharge: Partial<Run> = {}): Run => ({
	performance: 0.95,
	accessibility: 1,
	bestPractices: 1,
	seo: 1,
	seoWithoutCrawlable: 1,
	fcpMs: 900,
	lcpMs: 2000,
	cls: 0.01,
	tbtMs: 100,
	transferBytes: 400_000,
	scriptBytes: 170 * 1024,
	requests: 30,
	benchmarkIndex: 1000,
	load1: 0.2,
	...surcharge,
})

const pages = (surcharge: Partial<Run> = {}, only: readonly string[] = PLAN_PAGES): PageResult[] =>
	PLAN_PAGES.map(page => ({
		page,
		path: `/${page}`,
		runs: [1, 2, 3].map(() => good(only.includes(page) ? surcharge : {})),
	}))

const BEFORE = new Date('2026-10-30T10:00:00Z')
const AFTER = new Date(`${BLOCKING_FROM}T00:00:00Z`)

describe('le mode : avertissement deux semaines, puis blocage', () => {
	test('avant la date, avertissement ; à la date et après, erreur', () => {
		expect(BLOCKING_FROM).toBe('2026-11-06')
		expect(modeAt(new Date('2026-10-23T12:00:00Z'))).toBe('warn')
		expect(modeAt(new Date('2026-11-05T23:59:59Z'))).toBe('warn')
		expect(modeAt(AFTER)).toBe('error')
		expect(modeAt(new Date('2027-01-01T00:00:00Z'))).toBe('error')
	})

	test('la performance demandée passe de 85 à 90 deux semaines après le début du blocage', () => {
		expect(STRICT_PERFORMANCE_FROM).toBe('2026-11-20')
		expect(budgetsAt(AFTER).performance).toBe(0.85)
		expect(budgetsAt(new Date('2026-11-19T23:59:59Z')).performance).toBe(0.85)
		expect(budgetsAt(new Date('2026-11-20T00:00:00Z')).performance).toBe(0.9)
	})
})

describe('le jugement des quatre pages', () => {
	test('des pages dans les budgets : aucun constat, code 0 dans les deux modes', () => {
		for (const now of [BEFORE, AFTER]) {
			const result = evaluate(pages(), now)
			expect(result.findings).toEqual([])
			expect(exitCode(result)).toBe(0)
		}
	})

	test('une régression semée (TBT et LCP en hausse sur l’accueil) : constat nommé, avertissement avant la date', () => {
		const result = evaluate(pages({ tbtMs: 900, lcpMs: 4200, performance: 0.6 }, ['P01']), BEFORE)
		expect(result.mode).toBe('warn')
		expect(result.findings.map(f => f.page)).toEqual(['P01', 'P01', 'P01'])
		expect(result.findings.map(f => f.name).sort()).toEqual(['LCP', 'Performance', 'TBT'])
		expect(exitCode(result)).toBe(0)
		const lines = annotations(result)
		expect(lines).toHaveLength(3)
		expect(lines.every(line => line.startsWith('::warning '))).toBe(true)
		expect(lines.join('\n')).toContain('P01')
	})

	test('la même régression après la date : erreur, code 1', () => {
		const result = evaluate(pages({ tbtMs: 900, lcpMs: 4200, performance: 0.6 }, ['P01']), AFTER)
		expect(result.mode).toBe('error')
		expect(exitCode(result)).toBe(1)
		expect(annotations(result).every(line => line.startsWith('::error '))).toBe(true)
	})

	test('une régression sur chacun des budgets est vue : CLS, accessibilité, SEO, et le JavaScript de la recherche', () => {
		const names = (surcharge: Partial<Run>, only: string[]) =>
			evaluate(pages(surcharge, only), AFTER).findings.map(f => `${f.page} ${f.name}`)
		expect(names({ cls: 0.4 }, ['P03'])).toEqual(['P03 CLS'])
		expect(names({ accessibility: 0.8 }, ['P04'])).toEqual(['P04 Accessibilité'])
		expect(names({ seo: 0.9, seoWithoutCrawlable: 0.9 }, ['P03'])).toEqual(['P03 SEO'])
		expect(names({ scriptBytes: 400 * 1024 }, ['P02'])).toEqual(['P02 JavaScript'])
	})

	test('la note de SEO brute de la recherche (noindex voulu) n’est pas une régression', () => {
		expect(evaluate(pages({ seo: 0.66 }, ['P02']), AFTER).findings).toEqual([])
	})

	test('le budget de performance suit la date : 88 passe avant le 20/11 et manque après', () => {
		const middle = pages({ performance: 0.88 }, ['P03'])
		expect(evaluate(middle, new Date('2026-11-10T00:00:00Z')).findings).toEqual([])
		expect(evaluate(middle, new Date('2026-11-20T00:00:00Z')).findings.map(f => f.name)).toEqual(['Performance'])
	})
})

describe('une mesure qui n’a pas pu se faire', () => {
	test('avant la date : un avertissement, code 0 ; après : une erreur, code 1', () => {
		const warn = evaluate(undefined, BEFORE, 'Lighthouse a échoué sur /')
		expect(exitCode(warn)).toBe(0)
		expect(annotations(warn)[0]).toStartWith('::warning ')
		expect(annotations(warn)[0]).toContain('Lighthouse a échoué')
		const error = evaluate(undefined, AFTER, 'Lighthouse a échoué sur /')
		expect(exitCode(error)).toBe(1)
		expect(annotations(error)[0]).toStartWith('::error ')
	})
})
