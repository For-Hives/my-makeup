/**
 * The measure of the speed of the four reference pages (ticket 179; plan 02 §7.5, P01 to P04): what is read in
 * a Lighthouse report, the median of several runs, the budgets, and the comparison with the site that is
 * online. No network, no process: the command that runs Lighthouse is scripts/perf/lighthouse.ts, and this
 * file is what its tests play (tests/unit/perf-lighthouse.test.ts).
 */

/** The four pages of the plan, by their number. */
export const PLAN_PAGES = ['P01', 'P02', 'P03', 'P04'] as const
export type PlanPage = (typeof PLAN_PAGES)[number]

/** What the budgets of plan 02 §7.5 ask of a page, in mobile. */
export interface Budgets {
	/** The performance score, from 0 to 1. */
	performance: number
	/** The largest contentful paint, in milliseconds. */
	lcpMs: number
	/** The cumulative layout shift. */
	cls: number
	/** The total blocking time, in milliseconds. */
	tbtMs: number
	/** The accessibility score, from 0 to 1. */
	accessibility: number
	/** The SEO score, from 0 to 1. */
	seo: number
}

/** The budgets of the four pages: « performance ≥ 0.85 then 0.90 », this is the first step. */
export const BUDGETS: Budgets = {
	performance: 0.85,
	lcpMs: 2500,
	cls: 0.1,
	tbtMs: 200,
	accessibility: 0.95,
	seo: 1,
}

/**
 * P02 (the search) is `noindex` on purpose (plan 02 U52): Lighthouse's audit `is-crawlable` fails and the SEO
 * score falls to 66, as it did for the site online. Its SEO budget is read without that audit, as the reference
 * measure did; the raw score stays in the report.
 */

/** P02 also has a budget on its JavaScript: 250 KB (1 KB is 1 024 bytes). */
export const SEARCH_SCRIPT_BUDGET_BYTES = 250 * 1024

/** What one run of Lighthouse gives, kept short. */
export interface Run {
	performance: number
	accessibility: number
	bestPractices: number
	seo: number
	/** The SEO score without the audit `is-crawlable`, which a page that is `noindex` on purpose fails. */
	seoWithoutCrawlable: number
	fcpMs: number
	lcpMs: number
	cls: number
	tbtMs: number
	transferBytes: number
	scriptBytes: number
	requests: number
	/** The power index of the machine, read by Lighthouse at the start of the run. */
	benchmarkIndex: number
	/** The load average of the machine over one minute, read when the run started. */
	load1: number
}

interface AuditRef {
	id: string
	weight: number
}

/** The part of a Lighthouse report this file reads. */
export interface Report {
	lighthouseVersion?: string
	categories: Record<string, { score: number | null; auditRefs?: readonly AuditRef[] } | undefined>
	audits: Record<
		string,
		| { score?: number | null; numericValue?: number; details?: { items?: readonly Record<string, unknown>[] } }
		| undefined
	>
	environment?: { benchmarkIndex?: number; hostUserAgent?: string }
}

/** The browser a report was made with, as `HeadlessChrome/156`, read from its user agent. */
export function browserOf(report: Report): string | undefined {
	const match = /(Headless)?Chrome\/(\d+)/.exec(report.environment?.hostUserAgent ?? '')
	return match ? `${match[1] ?? ''}Chrome ${match[2]}` : undefined
}

const category = (report: Report, name: string): number => {
	const score = report.categories[name]?.score
	if (typeof score !== 'number') throw new Error(`Le rapport n’a pas de note « ${name} ».`)
	return score
}

const audit = (report: Report, name: string): number => {
	const value = report.audits[name]?.numericValue
	if (typeof value !== 'number') throw new Error(`Le rapport n’a pas la mesure « ${name} ».`)
	return value
}

/** The SEO score as Lighthouse weighs it, without the audit that reads `noindex`. */
function seoWithoutCrawlable(report: Report): number {
	const refs = (report.categories.seo?.auditRefs ?? []).filter(({ id }) => id !== 'is-crawlable')
	let weight = 0
	let total = 0
	for (const { id, weight: w } of refs) {
		const score = report.audits[id]?.score
		if (typeof score !== 'number' || w <= 0) continue
		weight += w
		total += w * score
	}
	return weight === 0 ? category(report, 'seo') : total / weight
}

/** Reads the numbers of one report. `load1` is the load of the machine when the run started. */
export function readRun(report: Report, load1: number): Run {
	const summary = report.audits['resource-summary']?.details?.items ?? []
	const scripts = summary.find(item => item.resourceType === 'script')
	const total = summary.find(item => item.resourceType === 'total')
	const requests = report.audits['network-requests']?.details?.items?.length ?? 0
	return {
		performance: category(report, 'performance'),
		accessibility: category(report, 'accessibility'),
		bestPractices: category(report, 'best-practices'),
		seo: category(report, 'seo'),
		seoWithoutCrawlable: seoWithoutCrawlable(report),
		fcpMs: audit(report, 'first-contentful-paint'),
		lcpMs: audit(report, 'largest-contentful-paint'),
		cls: audit(report, 'cumulative-layout-shift'),
		tbtMs: audit(report, 'total-blocking-time'),
		transferBytes: Math.round(audit(report, 'total-byte-weight')),
		scriptBytes: typeof scripts?.transferSize === 'number' ? scripts.transferSize : 0,
		requests: requests || (typeof total?.requestCount === 'number' ? total.requestCount : 0),
		benchmarkIndex: report.environment?.benchmarkIndex ?? 0,
		load1,
	}
}

/** The median of a list: the middle value, or the mean of the two in the middle. */
export function median(values: readonly number[]): number {
	if (values.length === 0) throw new Error('Une médiane demande au moins une valeur.')
	const sorted = [...values].sort((a, b) => a - b)
	const middle = Math.floor(sorted.length / 2)
	const upper = sorted[middle] as number
	return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] as number) + upper) / 2
}

/** The median of every number of the runs, each taken on its own. */
export function medianRun(runs: readonly Run[]): Run {
	const keys = Object.keys(runs[0] ?? {}) as (keyof Run)[]
	if (keys.length === 0) throw new Error('Il faut au moins un passage.')
	const entries = keys.map(key => [key, median(runs.map(run => run[key]))] as const)
	return Object.fromEntries(entries) as unknown as Run
}

/** One budget, judged on the median. */
export interface Verdict {
	name: string
	/** What was measured, as text. */
	value: string
	/** What the plan asks, as text. */
	limit: string
	held: boolean
	/** How many runs, taken one by one, hold the budget (the median can tip from one measure to the next). */
	runsHeld: number
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`
const kilobytes = (bytes: number) => `${Math.round(bytes / 1024)} Ko`
const score = (value: number) => String(Math.round(value * 100))

/** Judges the median of a page against the budgets of the plan; P02 has one more, on its JavaScript. */
export function judge(page: PlanPage, runs: readonly Run[], budgets: Budgets = BUDGETS): Verdict[] {
	const median = medianRun(runs)
	const verdict = (name: string, value: string, limit: string, test: (run: Run) => boolean): Verdict => ({
		name,
		value,
		limit,
		held: test(median),
		runsHeld: runs.filter(test).length,
	})
	const list: Verdict[] = [
		verdict(
			'Performance',
			score(median.performance),
			`≥ ${score(budgets.performance)}`,
			run => run.performance >= budgets.performance
		),
		verdict('LCP', seconds(median.lcpMs), `≤ ${seconds(budgets.lcpMs)}`, run => run.lcpMs <= budgets.lcpMs),
		verdict(
			'CLS',
			median.cls.toFixed(3).replace('.', ','),
			`≤ ${String(budgets.cls).replace('.', ',')}`,
			run => run.cls <= budgets.cls
		),
		verdict('TBT', `${Math.round(median.tbtMs)} ms`, `≤ ${budgets.tbtMs} ms`, run => run.tbtMs <= budgets.tbtMs),
		verdict(
			'Accessibilité',
			score(median.accessibility),
			`≥ ${score(budgets.accessibility)}`,
			run => run.accessibility >= budgets.accessibility
		),
		page === 'P02'
			? verdict(
					'SEO hors is-crawlable',
					score(median.seoWithoutCrawlable),
					`= ${score(budgets.seo)}`,
					run => run.seoWithoutCrawlable >= budgets.seo
				)
			: verdict('SEO', score(median.seo), `= ${score(budgets.seo)}`, run => run.seo >= budgets.seo),
	]
	if (page === 'P02') {
		list.push(
			verdict(
				'JavaScript',
				kilobytes(median.scriptBytes),
				`≤ ${kilobytes(SEARCH_SCRIPT_BUDGET_BYTES)}`,
				run => run.scriptBytes <= SEARCH_SCRIPT_BUDGET_BYTES
			)
		)
	}
	return list
}

/** What the site that is online gave in mobile, for one page (outils/migration, 16/10/2026, median of 5). */
export interface Reference {
	performance: number
	accessibility: number
	seo: number
	lcpMs: number
	cls: number
	tbtMs: number
	scriptBytes: number
}

/** The difference between the CLS of two runs below which a page is not worse: the report gives three decimals. */
export const CLS_TOLERANCE = 0.0005

/** How a page compares with the site that is online, on one measure where less is better. */
export interface Comparison {
	measure: 'LCP' | 'CLS'
	v3: string
	online: string
	/** `better`, `equal` or `worse`. */
	outcome: 'better' | 'equal' | 'worse'
}

/** Compares the LCP and the CLS of a page with the site that is online: the two measures of the ticket. */
export function compare(median: Run, reference: Reference): Comparison[] {
	const outcome = (v3: number, online: number, tolerance: number): Comparison['outcome'] =>
		v3 > online + tolerance ? 'worse' : v3 < online - tolerance ? 'better' : 'equal'
	return [
		{
			measure: 'LCP',
			v3: seconds(median.lcpMs),
			online: seconds(reference.lcpMs),
			outcome: outcome(median.lcpMs, reference.lcpMs, 50),
		},
		{
			measure: 'CLS',
			v3: median.cls.toFixed(3).replace('.', ','),
			online: reference.cls.toFixed(3).replace('.', ','),
			outcome: outcome(median.cls, reference.cls, CLS_TOLERANCE),
		},
	]
}

/** The machine is at rest when nothing else loads it: the same rule as the reference of the site online. */
export const REST = {
	/** The load over one minute, per core, above which the machine is busy. */
	maxLoadPerCore: 0.5,
	/** The spread of the power index, over its median, above which the machine was busy during the runs. */
	maxIndexSpread: 0.2,
	/** A run whose index falls below this share of the median is a run on a busy machine. */
	lowIndexShare: 0.8,
} as const

export interface Machine {
	cores: number
	load1: number
	load5: number
	/** Measuring or testing processes found beside the run (their names). */
	others: readonly string[]
}

/** Why the machine is not at rest before a run; empty when it is. */
export function busyBefore({ cores, load1, load5, others }: Machine): string[] {
	const reasons: string[] = []
	const ceiling = REST.maxLoadPerCore * cores
	if (load1 > ceiling || load5 > ceiling)
		reasons.push(
			`charge ${load1.toFixed(2)} sur 1 min et ${load5.toFixed(2)} sur 5 min pour ${cores} cœurs (seuil ${ceiling})`
		)
	if (others.length > 0) reasons.push(`autres processus de mesure ou de test : ${others.join(', ')}`)
	return reasons
}

/** Why the machine was not at rest during the runs, from the power index and the load read at each; empty when it was. */
export function busyDuring(runs: readonly Run[], cores: number): string[] {
	const reasons: string[] = []
	const indexes = runs.map(run => run.benchmarkIndex).filter(index => index > 0)
	if (indexes.length > 0) {
		const middle = median(indexes)
		const spread = (Math.max(...indexes) - Math.min(...indexes)) / middle
		if (spread > REST.maxIndexSpread)
			reasons.push(
				`indice de puissance instable : écart de ${Math.round(spread * 100)} % de sa médiane (seuil ${REST.maxIndexSpread * 100} %)`
			)
		const low = indexes.filter(index => index < REST.lowIndexShare * middle).length
		if (low > 0) reasons.push(`${low} passage(s) sous ${REST.lowIndexShare * 100} % de la médiane de l’indice`)
	}
	const ceiling = REST.maxLoadPerCore * cores
	const loaded = runs.filter(run => run.load1 > ceiling).length
	if (loaded > 0) reasons.push(`${loaded} passage(s) lancés avec une charge sur 1 min au-dessus de ${ceiling}`)
	return reasons
}

export interface PageResult {
	page: PlanPage
	/** The path measured: a slug of the bench, never a real profile. */
	path: string
	runs: Run[]
}

export interface Measure {
	date: string
	/** The commit the measured application was built from. */
	commit: string
	lighthouse: string
	browser: string
	runsPerPage: number
	pages: PageResult[]
	cores: number
	/** Empty when the machine was at rest before and during the runs. */
	busy: string[]
	/** Where it was measured: the bench of this machine (default) or the production site. */
	target?: 'bench' | 'production'
}

const NAME: Record<PlanPage, string> = {
	P01: 'Accueil',
	P02: 'Recherche Annecy',
	P03: 'Profil de référence',
	P04: 'Talent',
}

const verdictWord = (held: boolean) => (held ? 'oui' : 'non')

/** The report in French: the table of the medians, the budgets, the comparison, the method. */
export function renderReport(
	measure: Measure,
	references: Record<PlanPage, Reference>,
	accepted: readonly string[] = []
): string {
	const lines: string[] = []
	const rest = measure.busy.length === 0
	lines.push('# Vitesse de la v3 : les quatre pages de référence')
	lines.push('')
	lines.push(
		`Mesure du ${measure.date}, ${
			measure.target === 'production'
				? `site de production, version déployée \`${measure.commit}\`, lu en lecture seule depuis ce poste, réseau réel`
				: `application construite depuis le commit \`${measure.commit}\`, servie par \`next start\` sur le banc de test de ce poste (jeu fictif, aucune donnée réelle)`
		}. Lighthouse ${measure.lighthouse}, ${measure.browser}, **mobile** (réglages par défaut : Moto G Power émulé, débit simulé de 1,6 Mb/s, latence de 150 ms, processeur ralenti ×4). ${measure.runsPerPage} passages par page, **médiane** de chaque mesure prise séparément.`
	)
	lines.push('')
	lines.push(
		rest
			? '> **Machine au repos** avant et pendant les passages : la mesure est figée.'
			: `> **Machine non au repos : mesure indicative, non figée.** ${measure.busy.join(' ; ')}.`
	)
	lines.push('')
	lines.push('## Médianes (mobile)')
	lines.push('')
	lines.push(
		'| Page | Perf. | Access. | SEO | SEO hors `is-crawlable` | FCP | LCP | CLS | TBT | Poids | dont JS | Requêtes |'
	)
	lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|')
	for (const { page, path, runs } of measure.pages) {
		const m = medianRun(runs)
		lines.push(
			`| ${NAME[page]} (${page}, \`${path}\`) | ${score(m.performance)} | ${score(m.accessibility)} | ${score(m.seo)} | ${score(m.seoWithoutCrawlable)} | ${seconds(m.fcpMs)} | ${seconds(m.lcpMs)} | ${m.cls.toFixed(3).replace('.', ',')} | ${Math.round(m.tbtMs)} ms | ${kilobytes(m.transferBytes)} | ${kilobytes(m.scriptBytes)} | ${Math.round(m.requests)} |`
		)
	}
	lines.push('')
	lines.push('## Budgets du plan 02 §7.5')
	lines.push('')
	let held = 0
	let judged = 0
	for (const { page, runs } of measure.pages) {
		const verdicts = judge(page, runs)
		lines.push(`**${NAME[page]} (${page})**`)
		lines.push('')
		lines.push('| Budget | Demandé | Mesuré | Tenu | Passages qui le tiennent |')
		lines.push('|---|---|---|---|---|')
		for (const v of verdicts) {
			judged += 1
			if (v.held) held += 1
			lines.push(`| ${v.name} | ${v.limit} | ${v.value} | ${verdictWord(v.held)} | ${v.runsHeld} sur ${runs.length} |`)
		}
		lines.push('')
	}
	lines.push(`Budgets tenus : ${held} sur ${judged}.`)
	lines.push('')
	lines.push('## Comparaison avec le site en ligne (mesure du 16/10/2026, mobile, médiane de 5)')
	lines.push('')
	lines.push('| Page | Mesure | v3 | En ligne | Verdict |')
	lines.push('|---|---|---|---|---|')
	const worse: string[] = []
	for (const { page, runs } of measure.pages) {
		for (const c of compare(medianRun(runs), references[page])) {
			const word = c.outcome === 'worse' ? 'moins bon' : c.outcome === 'better' ? 'meilleur' : 'égal'
			const accepted_ = accepted.includes(`${page} ${c.measure}`)
			if (c.outcome === 'worse' && !accepted_) worse.push(`${page} ${c.measure}`)
			lines.push(
				`| ${NAME[page]} (${page}) | ${c.measure} | ${c.v3} | ${c.online} | ${word}${c.outcome === 'worse' && accepted_ ? ' (écart accepté par écrit)' : ''} |`
			)
		}
	}
	lines.push('')
	lines.push(
		worse.length === 0
			? 'Aucune page n’est moins bonne que le site en ligne sur le LCP et le CLS, ou l’écart est accepté par écrit.'
			: `Moins bon que le site en ligne, sans écart accepté : ${worse.join(', ')}.`
	)
	lines.push('')
	lines.push('## Lecture')
	lines.push('')
	lines.push(
		'- Le SEO de la recherche (P02) tombe à 66 parce que la page est en `noindex` voulu (plan 02 U52) : l’audit `is-crawlable` échoue. La colonne « SEO hors `is-crawlable` » dit la note sans lui ; le budget « SEO = 100 » se lit ainsi pour cette page, comme pour le relevé du site en ligne.'
	)
	lines.push(
		'- Le banc est sur ce poste, sans réseau ni CDN ni cache de production : le débit et la latence sont simulés par Lighthouse, mais la réponse du serveur est plus rapide qu’en ligne. Une comparaison ne vaut que contre le relevé du site en ligne fait de la même façon ; le dernier mot est donné par la même mesure sur l’hôte de production, après la bascule.'
	)
	lines.push('- Le jeu du banc a 12 profils : le profil et la liste de P02 sont plus petits que ceux de la production.')
	return `${lines.join('\n')}\n`
}
