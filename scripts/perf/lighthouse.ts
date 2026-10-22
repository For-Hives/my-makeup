/**
 * Measures the speed of the four reference pages of the plan on the new site (ticket 179; plan 02 §7.5):
 *
 *   bun run perf:lighthouse                       the application of the bench, 5 runs per page
 *   bun run perf:lighthouse --base http://127.0.0.1:3376 --runs 5 --out docs/mesure/lighthouse-v3.md
 *
 * Run alone, on a machine at rest, against an application built for production (`bun run bench:full`):
 * Lighthouse is run in mobile, one run after the other, pass by pass (every page, then the next pass), and the
 * median of each measure is kept. The report compares the medians with the budgets of the plan and with the
 * measure of the site that is online (docs/mesure/lighthouse-en-ligne-2026-10-16.json).
 *
 * Only an address of this machine is measured, unless `--production` is given: then the main domain only
 * (https://my-makeup.fr), by GET on public pages, with a pause of 10 s between two runs (issue 983). Lighthouse is not a
 * dependency of the repository: it runs through `npx` at the version below, which is the one that measured
 * the site online (published on 18/09/2026, no advisory in the GitHub database nor in its repository's).
 *
 * Options: `--base` (default http://127.0.0.1:<3100 + BENCH_OFFSET>), `--runs` (default 5), `--profile` and
 * `--talent` (a path; default the reference profile and the talent of the bench), `--chrome` (default the newest
 * Chromium of Playwright), `--out` (the report; the runs are written beside it, in a `.json` file),
 * `--indicative` (measure even when the machine is busy: the report says it is not frozen), `--accept "P01 LCP"`
 * (a gap with the online site that was accepted in writing, by the owner: never one the tool decides; repeatable).
 * The method and how to read the report: docs/mesure/lighthouse.md.
 *
 * Exit code: 0 when the report is written and nothing is missing, 4 when the machine is busy and
 * `--indicative` was not given (nothing is measured), 2 for a bad call.
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { cpus, homedir, loadavg, tmpdir } from 'node:os'
import path from 'node:path'
import {
	browserOf,
	busyBefore,
	busyDuring,
	type Measure,
	type PageResult,
	PLAN_PAGES,
	type PlanPage,
	type Reference,
	type Report,
	type Run,
	readRun,
	renderReport,
} from './lighthouse-measure'

/** The version of Lighthouse that measured the site online (docs/mesure/lighthouse-en-ligne-2026-10-16.json). */
export const LIGHTHOUSE_VERSION = '13.5.0'

const ROOT = path.resolve(import.meta.dir, '../..')
const REFERENCE_FILE = path.join(ROOT, 'docs/mesure/lighthouse-en-ligne-2026-10-16.json')

/** The addresses the audience measurement of the site uses: blocked, as for the reference, so no visit is counted. */
const BLOCKED = ['*/u/script.js*', '*/u/api/send*']

/** The reference profile of the bench (src/demo-data/profiles.ts, key `reference`): P03. A made-up person. */
export const BENCH_REFERENCE_PROFILE = '/profil/ines-morel'

/** The talent the measure of the site online took (`/talent/maquillage-mariee`), also in the bench dataset: P04. */
export const BENCH_TALENT = '/talent/maquillage-mariee'

const DEFAULT_OUT = 'docs/mesure/lighthouse-v3.md'

/** Pause between two runs, so that the machine settles. */
const PAUSE_MS = 3000

/** Pause between two runs on the production site: one page load every 10 s at most, nothing in parallel. */
const PRODUCTION_PAUSE_MS = 10_000

/** The one host `--production` measures: the main domain, read only (GET of public pages, nothing is written). */
export const PRODUCTION_ORIGIN = 'https://my-makeup.fr'

export class Refused extends Error {
	override name = 'Refused'
}

/** Only an address of this machine is measured, or with `production` the main domain and nothing else. */
export function requireLocalBase(base: string, production = false): URL {
	let url: URL
	try {
		url = new URL(base)
	} catch {
		throw new Refused(`« ${base} » n’est pas une adresse.`)
	}
	if (production) {
		if (url.origin !== PRODUCTION_ORIGIN)
			throw new Refused(`--production ne mesure que ${PRODUCTION_ORIGIN}, pas « ${url.origin} ».`)
		return url
	}
	if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol))
		throw new Refused(
			`Seule une adresse de ce poste se mesure (127.0.0.1, localhost ou [::1]), pas « ${url.hostname} » : la mesure du site en ligne est un autre outil.`
		)
	return url
}

export interface Options {
	base: string
	runs: number
	profile: string
	talent: string
	chrome?: string
	out: string
	indicative: boolean
	accepted: string[]
	/** Measure the production site (read only) instead of the bench of this machine. */
	production: boolean
	pauseMs: number
}

/** A production run names its report: the default one belongs to the bench, and the repository is public. */
export function checkProductionOptions(options: Options): void {
	if (options.production && (options.out === DEFAULT_OUT || !options.out))
		throw new Refused('--production demande --out <fichier> (le rapport du banc ne se réécrit pas).')
}

/** In the report of a production run, the profile measured is a person: it is never named. */
export function maskedPath(page: PlanPage, target: string, production: boolean): string {
	return production && page === 'P03' ? '/profil/<publiable>' : target
}

export function readOptions(args: readonly string[], env: Record<string, string | undefined>): Options {
	const offset = Number(env.BENCH_OFFSET ?? 0)
	const options: Options = {
		base: `http://127.0.0.1:${3100 + (Number.isFinite(offset) ? offset : 0)}`,
		runs: 5,
		profile: BENCH_REFERENCE_PROFILE,
		talent: BENCH_TALENT,
		out: DEFAULT_OUT,
		indicative: false,
		accepted: [],
		production: false,
		pauseMs: PAUSE_MS,
	}
	for (let i = 0; i < args.length; i++) {
		const name = args[i]
		const value = () => {
			const next = args[++i]
			if (next === undefined) throw new Refused(`L’option ${name} attend une valeur.`)
			return next
		}
		if (name === '--base') options.base = value()
		else if (name === '--runs') options.runs = Number(value())
		else if (name === '--profile') options.profile = value()
		else if (name === '--talent') options.talent = value()
		else if (name === '--chrome') options.chrome = value()
		else if (name === '--out') options.out = value()
		else if (name === '--indicative') options.indicative = true
		else if (name === '--accept') options.accepted.push(value())
		else if (name === '--production') {
			options.production = true
			options.base = PRODUCTION_ORIGIN
			options.pauseMs = PRODUCTION_PAUSE_MS
		} else throw new Refused(`Option inconnue : ${name}`)
	}
	if (!Number.isInteger(options.runs) || options.runs < 1)
		throw new Refused('--runs veut un nombre entier d’au moins 1.')
	return options
}

/** What counts as another measure or test running on this machine: Lighthouse, Playwright, the bun tests. */
export const OTHER_PROCESS_PATTERN =
	'lighthouse@|playwright/cli|playwright test|bun (--no-env-file )?test|scripts/e2e\\.ts|test:integration'

/**
 * The measuring or testing processes of this machine, other than this one and the shell that started it (their
 * command names). The application being measured is not one: it is the target.
 */
export function otherProcesses(
	lines: readonly string[],
	own: readonly number[] = [process.pid, process.ppid]
): string[] {
	const names = new Set<string>()
	for (const line of lines) {
		const [pid, ...words] = line.trim().split(/\s+/)
		const command = words.join(' ')
		if (!pid || own.includes(Number(pid))) continue
		if (/perf[:/]lighthouse/.test(command) || /^pgrep\b/.test(command)) continue
		names.add(words.slice(0, 2).join(' ').slice(0, 40))
	}
	return [...names]
}

/** The version the production site says it runs (`/api/health`). */
async function deployedVersion(base: URL): Promise<string> {
	const answer = await fetch(new URL('/api/health', base)).catch(() => undefined)
	const body = (await answer?.json().catch(() => undefined)) as { version?: unknown } | undefined
	return typeof body?.version === 'string' ? body.version : 'inconnu'
}

function runningProcesses(): string[] {
	const found = spawnSync('pgrep', ['-af', OTHER_PROCESS_PATTERN], { encoding: 'utf8' })
	return (found.stdout ?? '').split('\n').filter(line => line.trim() !== '')
}

/**
 * The browser: the newest Chromium of Playwright in `~/.cache/ms-playwright`, as the measure of the site that is
 * online took it (Chrome 156 on 16/10/2026). Not the one of the repository's Playwright, which can be older: with
 * Chromium 147, Lighthouse 13.5.0 never gets the first paint of a page that has a `Referrer-Policy` header
 * (NO_FCP), which every page of the site has.
 */
export function newestChromium(folder = path.join(homedir(), '.cache', 'ms-playwright')): string {
	const builds = existsSync(folder)
		? readdirSync(folder)
				.map(name => ({ name, n: /^chromium-(\d+)$/.exec(name)?.[1] }))
				.filter((build): build is { name: string; n: string } => build.n !== undefined)
				.sort((a, b) => Number(b.n) - Number(a.n))
		: []
	const newest = builds[0]
	if (!newest)
		throw new Refused('Aucun Chromium de Playwright dans ~/.cache/ms-playwright : `bunx playwright install chromium`.')
	return path.join(folder, newest.name, 'chrome-linux64', 'chrome')
}

function wait(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * One run of Lighthouse on an address, in mobile; gives the report. The process is waited for without blocking
 * this one.
 */
async function lighthouse(url: string, chrome: string, folder: string): Promise<Report> {
	const file = path.join(folder, 'report.json')
	const args = [
		'--yes',
		`lighthouse@${LIGHTHOUSE_VERSION}`,
		url,
		'--output=json',
		`--output-path=${file}`,
		'--quiet',
		'--only-categories=performance,accessibility,best-practices,seo',
		'--chrome-flags=--headless=new --no-sandbox',
		...BLOCKED.map(pattern => `--blocked-url-patterns=${pattern}`),
	]
	const child = spawn('npx', args, {
		env: { ...process.env, CHROME_PATH: chrome },
		stdio: ['ignore', 'ignore', 'pipe'],
	})
	let errors = ''
	child.stderr.on('data', chunk => {
		errors += String(chunk)
	})
	const status = await new Promise<number | null>(resolve => child.on('close', resolve))
	if (status !== 0) throw new Error(`Lighthouse a échoué sur ${url} : ${errors.slice(-400)}`)
	return JSON.parse(readFileSync(file, 'utf8')) as Report
}

export async function run(args: readonly string[], env: Record<string, string | undefined>): Promise<number> {
	let options: Options
	try {
		options = readOptions(args, env)
		checkProductionOptions(options)
		const base = requireLocalBase(options.base, options.production)
		const cores = cpus().length
		const before = busyBefore({
			cores,
			load1: loadavg()[0] ?? 0,
			load5: loadavg()[1] ?? 0,
			others: otherProcesses(runningProcesses()),
		})
		if (before.length > 0 && !options.indicative) {
			console.error(
				`Machine non au repos, rien n’est mesuré : ${before.join(' ; ')}. --indicative mesure quand même, sans figer.`
			)
			return 4
		}

		const health = await fetch(new URL('/api/health', base)).catch(() => undefined)
		if (!health?.ok)
			throw new Refused(`L’application ne répond pas sur ${base.origin} (/api/health) : \`bun run bench:full\`.`)
		const targets: Record<PlanPage, string> = {
			P01: '/',
			P02: '/search?city=Annecy',
			P03: options.profile,
			P04: options.talent,
		}
		for (const [page, target] of Object.entries(targets)) {
			const answer = await fetch(new URL(target, base)).catch(() => undefined)
			if (answer?.status !== 200)
				throw new Refused(
					`${page} (${target}) répond ${answer?.status ?? 'rien'} : le jeu du banc est-il chargé (\`bun run bench:full\`) ?`
				)
		}

		const chrome = options.chrome ?? newestChromium()
		const folder = mkdtempSync(path.join(tmpdir(), 'my-makeup-lighthouse-'))
		const results: PageResult[] = PLAN_PAGES.map(page => ({ page, path: targets[page], runs: [] as Run[] }))
		let version = LIGHTHOUSE_VERSION
		let browser = 'inconnu'
		try {
			for (let pass = 1; pass <= options.runs; pass++) {
				for (const result of results) {
					const load1 = loadavg()[0] ?? 0
					const report = await lighthouse(new URL(result.path, base).href, chrome, folder)
					version = report.lighthouseVersion ?? version
					browser = browserOf(report) ?? browser
					result.runs.push(readRun(report, load1))
					console.log(
						`passage ${pass}/${options.runs} ${result.page} : performance ${Math.round((result.runs.at(-1) as Run).performance * 100)}`
					)
					await wait(options.pauseMs)
				}
			}
		} finally {
			rmSync(folder, { recursive: true, force: true })
		}

		const busy = [
			...before,
			...busyDuring(
				results.flatMap(({ runs }) => runs),
				cores
			),
		]
		const commit = options.production
			? await deployedVersion(base)
			: spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim() || 'inconnu'
		const measure: Measure = {
			date: new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }),
			commit,
			lighthouse: version,
			browser,
			runsPerPage: options.runs,
			pages: results,
			cores,
			busy,
			target: options.production ? 'production' : 'bench',
		}
		for (const result of results) result.path = maskedPath(result.page, result.path, options.production)
		const references = JSON.parse(readFileSync(REFERENCE_FILE, 'utf8')).pages as Record<PlanPage, Reference>
		const out = path.resolve(ROOT, options.out)
		mkdirSync(path.dirname(out), { recursive: true })
		writeFileSync(out, renderReport(measure, references, options.accepted))
		writeFileSync(out.replace(/\.md$/, '.json'), `${JSON.stringify(measure, null, '\t')}\n`)
		console.log(
			`Rapport écrit : ${path.relative(ROOT, out)}${busy.length > 0 ? ' (machine non au repos : indicatif)' : ''}`
		)
		return 0
	} catch (error) {
		if (error instanceof Refused) {
			console.error(error.message)
			return 2
		}
		throw error
	}
}

if (import.meta.main) process.exit(await run(process.argv.slice(2), process.env))
