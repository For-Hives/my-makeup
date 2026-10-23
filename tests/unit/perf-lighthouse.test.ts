import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
	checkProductionOptions,
	firstSitemapProfile,
	maskedPath,
	newestChromium,
	otherProcesses,
	PRODUCTION_ORIGIN,
	Refused,
	readOptions,
	requireLocalBase,
} from '../../scripts/perf/lighthouse'
import {
	BUDGETS,
	browserOf,
	busyBefore,
	busyDuring,
	compare,
	judge,
	type Measure,
	median,
	medianRun,
	type Reference,
	type Report,
	type Run,
	readRun,
	renderReport,
} from '../../scripts/perf/lighthouse-measure'

/**
 * Ticket 179 (plan 02 §7.5): the measure of the speed of the four reference pages. Nothing here runs Lighthouse
 * nor reaches a host: the reports are made up, and the command's only network is the bench (docs/mesure/).
 */

const run = (surcharge: Partial<Run> = {}): Run => ({
	performance: 0.9,
	accessibility: 1,
	bestPractices: 1,
	seo: 1,
	seoWithoutCrawlable: 1,
	fcpMs: 900,
	lcpMs: 2000,
	cls: 0.01,
	tbtMs: 100,
	transferBytes: 400_000,
	scriptBytes: 200 * 1024,
	requests: 30,
	benchmarkIndex: 2000,
	load1: 0.2,
	...surcharge,
})

const report = (): Report => ({
	lighthouseVersion: '13.5.0',
	categories: {
		performance: { score: 0.91 },
		accessibility: { score: 0.97 },
		'best-practices': { score: 1 },
		seo: {
			score: 0.66,
			auditRefs: [
				{ id: 'is-crawlable', weight: 4 },
				{ id: 'document-title', weight: 1 },
				{ id: 'meta-description', weight: 1 },
				{ id: 'informative', weight: 0 },
			],
		},
	},
	audits: {
		'first-contentful-paint': { numericValue: 950 },
		'largest-contentful-paint': { numericValue: 2100 },
		'cumulative-layout-shift': { numericValue: 0.02 },
		'total-blocking-time': { numericValue: 120 },
		'total-byte-weight': { numericValue: 345_678.4 },
		'resource-summary': {
			details: {
				items: [
					{ resourceType: 'total', requestCount: 20 },
					{ resourceType: 'script', transferSize: 150_000 },
				],
			},
		},
		'network-requests': { details: { items: [{}, {}, {}] } },
		'is-crawlable': { score: 0 },
		'document-title': { score: 1 },
		'meta-description': { score: 1 },
		informative: { score: 0 },
	},
	environment: { benchmarkIndex: 2050 },
})

describe('median', () => {
	test('5 passages : la valeur du milieu, 4 passages : la moyenne des deux du milieu', () => {
		expect(median([3, 1, 5, 2, 4])).toBe(3)
		expect(median([10, 40, 20, 30])).toBe(25)
		expect(median([7])).toBe(7)
	})

	test('sans valeur, elle refuse', () => {
		expect(() => median([])).toThrow()
	})

	test('chaque mesure a sa médiane, prise à part', () => {
		const m = medianRun([
			run({ lcpMs: 1000, tbtMs: 300 }),
			run({ lcpMs: 3000, tbtMs: 100 }),
			run({ lcpMs: 2000, tbtMs: 200 }),
		])
		expect(m.lcpMs).toBe(2000)
		expect(m.tbtMs).toBe(200)
	})
})

describe('readRun', () => {
	test('lit les notes, les mesures et le poids d’un rapport', () => {
		const r = readRun(report(), 0.4)
		expect(r).toMatchObject({
			performance: 0.91,
			accessibility: 0.97,
			seo: 0.66,
			lcpMs: 2100,
			cls: 0.02,
			tbtMs: 120,
			transferBytes: 345_678,
			scriptBytes: 150_000,
			requests: 3,
			benchmarkIndex: 2050,
			load1: 0.4,
		})
	})

	test('le SEO sans « is-crawlable » : la page en noindex voulu n’est pas pénalisée, un audit sans poids est ignoré', () => {
		expect(readRun(report(), 0).seoWithoutCrawlable).toBe(1)
	})

	test('un rapport sans mesure est refusé en nommant la mesure', () => {
		const broken = report()
		delete broken.audits['largest-contentful-paint']
		expect(() => readRun(broken, 0)).toThrow('largest-contentful-paint')
	})
})

describe('judge : les budgets du plan 02 §7.5', () => {
	const runs = (surcharge: Partial<Run> = {}) => [1, 2, 3, 4, 5].map(() => run(surcharge))
	const held = (page: 'P01' | 'P02', surcharge: Partial<Run> = {}) =>
		Object.fromEntries(judge(page, runs(surcharge)).map(v => [v.name, v.held]))

	test('une page dans les budgets les tient tous', () => {
		expect(Object.values(held('P01')).every(Boolean)).toBe(true)
	})

	test('chaque budget échoue de son côté de la limite', () => {
		expect(held('P01', { performance: BUDGETS.performance - 0.01 }).Performance).toBe(false)
		expect(held('P01', { performance: BUDGETS.performance }).Performance).toBe(true)
		expect(held('P01', { lcpMs: 2501 }).LCP).toBe(false)
		expect(held('P01', { lcpMs: 2500 }).LCP).toBe(true)
		expect(held('P01', { cls: 0.11 }).CLS).toBe(false)
		expect(held('P01', { tbtMs: 201 }).TBT).toBe(false)
		expect(held('P01', { accessibility: 0.94 }).Accessibilité).toBe(false)
		expect(held('P01', { seo: 0.99 }).SEO).toBe(false)
	})

	test('le SEO de la recherche se lit hors is-crawlable : la page est en noindex voulu', () => {
		const noindex = { seo: 0.66, seoWithoutCrawlable: 1 }
		expect(held('P02', noindex)['SEO hors is-crawlable']).toBe(true)
		expect(held('P02', { seo: 1, seoWithoutCrawlable: 0.9 })['SEO hors is-crawlable']).toBe(false)
		// The other pages keep the plain score.
		expect(held('P01', noindex).SEO).toBe(false)
	})

	test('le budget de JavaScript ne vaut que pour la recherche', () => {
		expect(held('P02', { scriptBytes: 251 * 1024 }).JavaScript).toBe(false)
		expect(held('P02', { scriptBytes: 250 * 1024 }).JavaScript).toBe(true)
		expect('JavaScript' in held('P01', { scriptBytes: 900 * 1024 })).toBe(false)
	})

	test('le verdict suit la médiane, et dit combien de passages tiennent le budget', () => {
		const five = [1900, 2000, 2600, 2700, 2800].map(lcpMs => run({ lcpMs }))
		const lcp = judge('P01', five).find(v => v.name === 'LCP')
		expect(lcp).toMatchObject({ held: false, runsHeld: 2, value: '2,6 s' })
	})
})

describe('compare : la v3 contre le site en ligne', () => {
	const online: Reference = {
		performance: 0.88,
		accessibility: 0.96,
		seo: 1,
		lcpMs: 3362,
		cls: 0,
		tbtMs: 235,
		scriptBytes: 218_367,
	}

	test('plus rapide, égale, plus lente', () => {
		expect(compare(run({ lcpMs: 2000, cls: 0 }), online).map(c => c.outcome)).toEqual(['better', 'equal'])
		expect(compare(run({ lcpMs: 3362, cls: 0.0004 }), online).map(c => c.outcome)).toEqual(['equal', 'equal'])
		expect(compare(run({ lcpMs: 3500, cls: 0.02 }), online).map(c => c.outcome)).toEqual(['worse', 'worse'])
	})
})

describe('la machine au repos', () => {
	test('refusée avant le premier passage quand elle est chargée ou qu’un autre processus mesure', () => {
		expect(busyBefore({ cores: 8, load1: 0.4, load5: 0.9, others: [] })).toEqual([])
		expect(busyBefore({ cores: 8, load1: 4.1, load5: 1, others: [] })).toHaveLength(1)
		expect(busyBefore({ cores: 8, load1: 0.1, load5: 0.1, others: ['bun test'] })[0]).toContain('bun test')
	})

	test('refusée après les passages quand l’indice de puissance a varié ou que la charge est montée', () => {
		const steady = [1, 2, 3, 4, 5].map(() => run())
		expect(busyDuring(steady, 8)).toEqual([])
		const unstable = [run(), run({ benchmarkIndex: 1000 }), run(), run(), run()]
		expect(busyDuring(unstable, 8).join(' ')).toContain('indice')
		expect(busyDuring([run({ load1: 6 }), run()], 8).join(' ')).toContain('charge')
	})
})

describe('le rapport', () => {
	const references = Object.fromEntries(
		['P01', 'P02', 'P03', 'P04'].map(page => [
			page,
			{ performance: 0.9, accessibility: 1, seo: 1, lcpMs: 2500, cls: 0.01, tbtMs: 200, scriptBytes: 200_000 },
		])
	) as Record<'P01' | 'P02' | 'P03' | 'P04', Reference>
	const measure = (busy: string[], lcpMs = 2000): Measure => ({
		date: '2026-10-20',
		commit: 'abc1234',
		lighthouse: '13.5.0',
		browser: 'Chromium',
		runsPerPage: 5,
		cores: 8,
		busy,
		pages: (['P01', 'P02', 'P03', 'P04'] as const).map(page => ({
			page,
			path: page === 'P01' ? '/' : '/x',
			runs: [1, 2, 3, 4, 5].map(() => run({ lcpMs })),
		})),
	})

	test('une machine au repos fige la mesure, une machine chargée la dit indicative', () => {
		expect(renderReport(measure([]), references)).toContain('la mesure est figée')
		const busy = renderReport(measure(['charge 9 sur 1 min']), references)
		expect(busy).toContain('mesure indicative, non figée')
		expect(busy).toContain('charge 9 sur 1 min')
	})

	test('une page moins bonne que le site en ligne est nommée, sauf écart accepté par écrit', () => {
		const slower = measure([], 2900)
		expect(renderReport(slower, references)).toContain(
			'Moins bon que le site en ligne, sans écart accepté : P01 LCP, P02 LCP, P03 LCP, P04 LCP.'
		)
		const accepted = renderReport(slower, references, ['P01 LCP', 'P02 LCP', 'P03 LCP', 'P04 LCP'])
		expect(accepted).toContain('écart accepté par écrit')
		expect(accepted).toContain('Aucune page n’est moins bonne')
	})

	test('un rapport de production le dit, avec la version déployée', () => {
		const text = renderReport({ ...measure([]), target: 'production', commit: '3a75c9f' }, references)
		expect(text).toContain('site de production, version déployée `3a75c9f`')
		expect(text).not.toContain('banc de test')
	})

	test('en production, le profil mesuré n’est jamais nommé dans le rapport', () => {
		expect(maskedPath('P03', '/profil/une-vraie-personne', true)).toBe('/profil/<publiable>')
		expect(maskedPath('P03', '/profil/ines-morel', false)).toBe('/profil/ines-morel')
		expect(maskedPath('P04', '/talent/maquillage-femme', true)).toBe('/talent/maquillage-femme')
	})

	test('cinq passages par page et la médiane sont dits', () => {
		expect(renderReport(measure([]), references)).toContain('5 passages par page, **médiane**')
	})
})

describe('la commande', () => {
	test('ne mesure qu’une adresse de ce poste', () => {
		expect(requireLocalBase('http://127.0.0.1:3376').hostname).toBe('127.0.0.1')
		expect(requireLocalBase('http://localhost:3100').hostname).toBe('localhost')
		expect(() => requireLocalBase('https://my-makeup.fr')).toThrow(Refused)
		expect(() => requireLocalBase('http://127.0.0.1.example.com')).toThrow(Refused)
		expect(() => requireLocalBase('pas une adresse')).toThrow(Refused)
	})

	test('--production ne mesure que le domaine principal, en lecture seule, avec une pause plus longue', () => {
		expect(PRODUCTION_ORIGIN).toBe('https://my-makeup.fr')
		expect(requireLocalBase(PRODUCTION_ORIGIN, true).origin).toBe(PRODUCTION_ORIGIN)
		expect(() => requireLocalBase('https://www.my-makeup.fr', true)).toThrow(Refused)
		expect(() => requireLocalBase('https://my-makeup.fr.example.com', true)).toThrow(Refused)
		expect(() => requireLocalBase('http://127.0.0.1:3100', true)).toThrow(Refused)
		const options = readOptions(['--production', '--profile', '/profil/x'], {})
		expect(options).toMatchObject({ production: true, base: PRODUCTION_ORIGIN, runs: 5, profile: '/profil/x' })
		expect(options.pauseMs).toBeGreaterThanOrEqual(10_000)
		// the default report is the bench's: a production run never overwrites it, it names its own file
		expect(() => checkProductionOptions(options)).toThrow(Refused)
		expect(() => checkProductionOptions({ ...options, out: 'docs/mesure/lighthouse-v3.md' })).toThrow(Refused)
		expect(() => checkProductionOptions({ ...options, out: 'docs/mesure/lighthouse-production.md' })).not.toThrow()
		expect(readOptions([], {})).toMatchObject({ production: false, pauseMs: 3000 })
		// a remote base without --production stays refused
		expect(() => requireLocalBase(PRODUCTION_ORIGIN)).toThrow(Refused)
	})

	test('en production, le profil mesuré est le premier profil du sitemap fourni', () => {
		const sitemap = `<?xml version="1.0"?><urlset>
			<url><loc>https://my-makeup.fr/</loc></url>
			<url><loc>https://my-makeup.fr/blog/un-article</loc></url>
			<url><loc>https://my-makeup.fr/profil/</loc></url>
			<url><loc>https://my-makeup.fr/profil/premiere-personne-fictive</loc></url>
			<url><loc>https://my-makeup.fr/profil/seconde-personne-fictive</loc></url>
		</urlset>`
		expect(firstSitemapProfile(sitemap)).toBe('/profil/premiere-personne-fictive')
		// an address with a query or a deeper path is not a profile page
		expect(
			firstSitemapProfile(
				'<urlset><url><loc>https://my-makeup.fr/profil/a/b</loc></url><url><loc>https://my-makeup.fr/profil/c?d=1</loc></url><url><loc>https://my-makeup.fr/profil/bon</loc></url></urlset>'
			)
		).toBe('/profil/bon')
		expect(firstSitemapProfile('<urlset><url><loc>https://my-makeup.fr/blog/x</loc></url></urlset>')).toBeUndefined()
		expect(firstSitemapProfile('')).toBeUndefined()
	})

	test('les options : 5 passages, le port de l’instance du banc, et un refus net pour le reste', () => {
		expect(readOptions([], { BENCH_OFFSET: '276' })).toMatchObject({
			base: 'http://127.0.0.1:3376',
			runs: 5,
			indicative: false,
		})
		expect(readOptions(['--runs', '3', '--indicative', '--accept', 'P01 LCP'], {})).toMatchObject({
			runs: 3,
			indicative: true,
			accepted: ['P01 LCP'],
		})
		expect(() => readOptions(['--runs', '0'], {})).toThrow(Refused)
		expect(() => readOptions(['--inconnue'], {})).toThrow(Refused)
		expect(() => readOptions(['--base'], {})).toThrow(Refused)
	})

	test('les pages par défaut sont le profil de référence et le talent du banc', () => {
		expect(readOptions([], {})).toMatchObject({ profile: '/profil/ines-morel', talent: '/talent/maquillage-mariee' })
		expect(readOptions(['--profile', '/profil/autre', '--talent', '/talent/x'], {})).toMatchObject({
			profile: '/profil/autre',
			talent: '/talent/x',
		})
	})

	test('le navigateur est le Chromium de Playwright le plus récent, pas le plus ancien', () => {
		const folder = mkdtempSync(path.join(tmpdir(), 'chromiums-'))
		try {
			for (const name of [
				'chromium-1217',
				'chromium-1248',
				'chromium-1234',
				'chromium_headless_shell-1300',
				'firefox-1538',
			])
				mkdirSync(path.join(folder, name))
			expect(newestChromium(folder)).toBe(path.join(folder, 'chromium-1248', 'chrome-linux64', 'chrome'))
			expect(() => newestChromium(path.join(folder, 'absent'))).toThrow(Refused)
		} finally {
			rmSync(folder, { recursive: true, force: true })
		}
	})

	test('les autres mesures ou tests sont comptés, pas la commande elle-même, ni son shell, ni l’application mesurée', () => {
		const lines = [
			'100 bun run perf:lighthouse --runs 5',
			'101 timeout 900 bun run perf:lighthouse',
			'200 npm exec lighthouse@13.5.0 http://127.0.0.1:3376/',
			'201 bun --no-env-file test tests/unit/x.test.ts',
			'300 pgrep -af lighthouse',
		]
		expect(otherProcesses(lines, [100])).toEqual(['npm exec', 'bun --no-env-file'])
		expect(otherProcesses([], [100])).toEqual([])
		// The own process and its parent never count, even if their line looks like a measure.
		expect(otherProcesses(['500 npm exec lighthouse@13.5.0'], [500])).toEqual([])
	})

	test('le navigateur du rapport est lu dans son agent utilisateur', () => {
		const withAgent = (hostUserAgent: string): Report => ({ ...report(), environment: { hostUserAgent } })
		expect(
			browserOf(withAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/156.0.0.0 Safari/537.36'))
		).toBe('HeadlessChrome 156')
		expect(browserOf(withAgent('Mozilla/5.0 Chrome/147.0.0.0'))).toBe('Chrome 147')
		expect(browserOf(report())).toBeUndefined()
	})
})
