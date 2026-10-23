/**
 * The crawl of the interfaces of a host (ticket 177, docs/tests/crawl-interfaces.md): a real browser opens 40
 * addresses at two screen widths, phone and desktop, and reports what the tests by journey do not see.
 *
 *   UI_CRAWL_TARGET=http://127.0.0.1:3100 bun run cutover:ui-crawl            # the bench, a build of this machine
 *   UI_CRAWL_ACCESS_USER=… UI_CRAWL_ACCESS_PASSWORD=… \
 *     UI_CRAWL_TARGET=https://v3.my-makeup.fr bun run cutover:ui-crawl        # the temporary host, reads only
 *   UI_CRAWL_TARGET=https://my-makeup.fr bun run cutover:ui-crawl             # the live site, reads only
 *
 * It reads, and only reads, like the check of a host (scripts/cutover/host-check.ts):
 * - every request of the browser goes through one route: a GET on the target and under the rules of
 *   scripts/cutover/host-guard.ts goes out, anything else is answered by an empty 204 and written in the report
 *   (a write, another origin, a path under `/u` the inventory does not name). The audience measurement posts its
 *   events to `/u/api/send`: that POST never leaves, and is not a defect;
 * - anonymous: a context without cookies and without storage, one per screen width. The protected access of the
 *   temporary host is added by the route to the requests to that host, and to none other;
 * - every request starts at least 500 ms after the one before it, the page's own images and scripts included:
 *   2 per second at most on a production host. On this machine there is no wait;
 * - the report never writes the address of a real profile: a profile is « profil #xxxxxxxx », the first 8 digits
 *   of the SHA-256 of its path.
 *
 * Exit code: 0 no defect, 1 at least one defect, 2 the target or a setting is refused (nothing left this machine).
 */

import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { type Browser, chromium } from '@playwright/test'
import { type Clock, REAL_CLOCK } from '../../tests/probes/reader'
import {
	CRAWL_ADDRESS_COUNT,
	CRAWL_SCREENS,
	type CrawlAddress,
	type CrawlScreen,
	crawlAddresses,
	crawlPage,
	type Defect,
	findDefects,
} from '../../tests/support/ui-crawl'
import { sitemapAddresses } from './host-check'
import { checkQuery, checkTarget, ForbiddenQuery, keep, TargetRefused, TEMPORARY_HOST } from './host-guard'

/** The variables the command reads. */
export type Variables = Partial<
	Record<'UI_CRAWL_ACCESS_PASSWORD' | 'UI_CRAWL_ACCESS_USER' | 'UI_CRAWL_TARGET' | 'UI_CRAWL_OUTPUT', string>
>

export interface Settings {
	target: URL
	/** The `Authorization` header of the protected access: the temporary host only. */
	authorization?: string
	/** Where to write the report as JSON, or nothing. */
	output?: string
}

/** The crawl cannot run as it is set: the message names the variable, never its value. */
export class CrawlRefused extends Error {
	override readonly name = 'CrawlRefused'
}

/** 500 ms between two starts: two requests per second at most, as the probes and the check of a host. */
export const MINIMUM_GAP_MS = 500

/** The addresses of this machine are read without a wait: the pace protects a site, not the bench. */
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']

export function readSettings(variables: Variables): Settings {
	const raw = variables.UI_CRAWL_TARGET?.trim()
	if (!raw) throw new TargetRefused('UI_CRAWL_TARGET manque : l’hôte à parcourir, comme https://my-makeup.fr.')
	const target = (() => {
		try {
			return checkTarget(raw)
		} catch (error) {
			// The guard names the variable of the check of a host: this command names its own.
			if (error instanceof TargetRefused)
				throw new TargetRefused(error.message.replaceAll('HOST_CHECK_TARGET', 'UI_CRAWL_TARGET'))
			throw error
		}
	})()
	const user = variables.UI_CRAWL_ACCESS_USER ?? ''
	const password = variables.UI_CRAWL_ACCESS_PASSWORD ?? ''
	if ((user === '') !== (password === ''))
		throw new CrawlRefused('UI_CRAWL_ACCESS_USER et UI_CRAWL_ACCESS_PASSWORD vont ensemble : donne les deux, ou aucun.')
	if (user !== '' && target.hostname !== TEMPORARY_HOST)
		throw new CrawlRefused(
			`UI_CRAWL_ACCESS_USER et UI_CRAWL_ACCESS_PASSWORD ne servent que pour https://${TEMPORARY_HOST} : ils ne partent jamais vers un autre hôte.`
		)
	const output = variables.UI_CRAWL_OUTPUT?.trim()
	return {
		target,
		...(user !== '' ? { authorization: `Basic ${btoa(`${user}:${password}`)}` } : {}),
		...(output ? { output } : {}),
	}
}

/* ------------------------------------------------------------------------------------------
 * The pace
 * ---------------------------------------------------------------------------------------- */

/** Lets requests start one after the other, `gapMs` apart at least. Requests that ask together are served in order. */
export function createPacer(gapMs: number, clock: Clock = REAL_CLOCK) {
	const starts: number[] = []
	let queue: Promise<unknown> = Promise.resolve()
	const turn = async (): Promise<void> => {
		const previous = starts.at(-1)
		if (previous !== undefined) {
			const rest = () => previous + gapMs - clock.maintenant()
			while (rest() > 0) await clock.attendre(Math.ceil(rest()))
		}
		starts.push(clock.maintenant())
	}
	return {
		/** Resolves when the request may start. */
		wait(): Promise<void> {
			const mine = queue.then(turn)
			queue = mine.catch(() => undefined)
			return mine
		},
		get starts(): readonly number[] {
			return starts
		},
	}
}

/* ------------------------------------------------------------------------------------------
 * The route of the browser
 * ---------------------------------------------------------------------------------------- */

/** What the route does with one request: let it through (with the headers to add), or answer it empty. */
export type Decision =
	| { action: 'continue'; headers: Record<string, string> }
	| { action: 'answer'; blocked: string | null }

/**
 * The decision for one request of the browser, by the rules of the guard of the check of a host. `method` and
 * `url` are the request's; `hasBody` says whether it carries a body.
 */
export function decide(request: { method: string; url: string; hasBody: boolean }, settings: Settings): Decision {
	const url = URL.canParse(request.url) ? new URL(request.url) : undefined
	// Inline resources (data:, blob:) never leave the machine: the browser serves them itself.
	if (url && (url.protocol === 'data:' || url.protocol === 'blob:')) return { action: 'continue', headers: {} }
	if (!url || url.origin !== settings.target.origin)
		return { action: 'answer', blocked: `${request.method} vers un autre hôte (${url?.host ?? 'adresse illisible'})` }
	// The audience measurement posts here: it does not leave, and it is not a defect of the page.
	if (request.method !== 'GET' && url.pathname === '/u/api/send') return { action: 'answer', blocked: null }
	try {
		const { entetes: headers } = checkQuery(
			url.pathname + url.search,
			{ method: request.method, ...(request.hasBody ? { body: 'x' } : {}) },
			settings.target,
			settings.authorization
		)
		const authorization = headers.get('authorization')
		return { action: 'continue', headers: authorization ? { authorization } : {} }
	} catch (error) {
		if (error instanceof ForbiddenQuery)
			return { action: 'answer', blocked: `${request.method} ${url.pathname} refusée par la garde` }
		throw error
	}
}

/* ------------------------------------------------------------------------------------------
 * The crawl
 * ---------------------------------------------------------------------------------------- */

export interface PageResult {
	screen: CrawlScreen
	/** The path as the report writes it: a profile is a fingerprint. */
	address: string
	status: number
	defects: Defect[]
}

export interface Report {
	date: string
	target: string
	addresses: number
	screens: CrawlScreen[]
	/** Pages read: addresses times screens. */
	pagesRead: number
	requests: number
	defectCount: number
	pages: PageResult[]
	verdict: 'conforme' | 'non conforme'
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

/** How the report names an address: a profile by its fingerprint, the rest as it is. */
export function reportedAddress(path: string): string {
	return path.startsWith('/profil/') ? `profil #${sha256(path).slice(0, 8)}` : path
}

/** What a defect says, with the addresses of real profiles hidden. */
const hideProfiles = (text: string): string =>
	text.replace(/\/profil\/[^\s"')?#]+/g, found => `profil #${sha256(found).slice(0, 8)}`)

export interface CrawlOptions {
	settings: Settings
	/** Where a test stands in for the browser's launch. */
	browser?: Browser
	clock?: Clock
	/** Called after each page, for the terminal. */
	onPage?: (result: PageResult) => void
}

/**
 * The line the browser writes in its console for the page it was asked to open when that page answers 404 or
 * another status the address is expected to answer: not a defect of the page, the answer was the point.
 */
export function isExpectedNotFound(message: string, address: CrawlAddress): boolean {
	return (
		address.expectedStatus !== 200 &&
		message.startsWith(`Failed to load resource: the server responded with a status of ${address.expectedStatus} `) &&
		message.endsWith(address.path)
	)
}

/** Reads the sitemap of the target, through the guard: a GET, anonymous, at the pace. */
async function readSitemap(settings: Settings, pacer: ReturnType<typeof createPacer>): Promise<string[]> {
	await pacer.wait()
	const read = keep(settings.target, undefined, settings.authorization)
	const response = await read('/sitemap.xml')
	if (response.status !== 200)
		throw new Error(`/sitemap.xml répond ${response.status} : le crawl ne sait pas quoi parcourir.`)
	return sitemapAddresses(await response.text())
}

/**
 * The options of the browser context for one screen width. `baseURL` is the origin of the target: the crawl
 * navigates to relative paths, and a browser launched here (not by the Playwright runner, which would add the
 * base of the bench by itself) has no other way to know where they lead (ticket 280).
 */
export function contextOptions(screen: CrawlScreen, settings: Settings) {
	return {
		baseURL: settings.target.origin,
		viewport: CRAWL_SCREENS[screen],
		isMobile: screen === 'mobile',
		hasTouch: screen === 'mobile',
		locale: 'fr-FR',
		timezoneId: 'Europe/Paris',
		serviceWorkers: 'block' as const,
	}
}

/** Opens the 40 addresses at the two widths of the screen and gives the report. */
export async function crawl(options: CrawlOptions): Promise<Report> {
	const { settings } = options
	const local = LOCAL_HOSTS.includes(settings.target.hostname)
	const pacer = createPacer(local ? 0 : MINIMUM_GAP_MS, options.clock)
	const addresses: CrawlAddress[] = crawlAddresses(await readSitemap(settings, pacer))
	const browser = options.browser ?? (await chromium.launch())
	const pages: PageResult[] = []
	let requests = 1
	try {
		for (const screen of Object.keys(CRAWL_SCREENS) as CrawlScreen[]) {
			const context = await browser.newContext(contextOptions(screen, settings))
			let blocked: string[] = []
			await context.route('**/*', async route => {
				const request = route.request()
				const decision = decide(
					{ method: request.method(), url: request.url(), hasBody: request.postData() !== null },
					settings
				)
				if (decision.action === 'answer') {
					if (decision.blocked) blocked.push(decision.blocked)
					await route.fulfill({ status: 204, body: '' })
					return
				}
				// Data and blob resources are not requests of the site.
				if (!request.url().startsWith('data:') && !request.url().startsWith('blob:')) {
					await pacer.wait()
					requests += 1
				}
				await route.continue({ headers: { ...request.headers(), ...decision.headers } })
			})
			const page = await context.newPage()
			try {
				for (const address of addresses) {
					blocked = []
					const facts = await crawlPage(page, address.path, {
						blockedRequests: () => [...new Set(blocked)],
						ignoreConsole: message => isExpectedNotFound(message, address),
					})
					const defects = findDefects(facts, address.expectedStatus).map(defect => ({
						...defect,
						detail: hideProfiles(defect.detail),
					}))
					const result: PageResult = { screen, address: reportedAddress(address.path), status: facts.status, defects }
					pages.push(result)
					options.onPage?.(result)
				}
			} finally {
				await context.close()
			}
		}
	} finally {
		if (!options.browser) await browser.close()
	}
	const defectCount = pages.reduce((total, page) => total + page.defects.length, 0)
	return {
		date: new Date().toISOString(),
		target: settings.target.origin,
		addresses: addresses.length,
		screens: Object.keys(CRAWL_SCREENS) as CrawlScreen[],
		pagesRead: pages.length,
		requests,
		defectCount,
		pages,
		verdict: defectCount === 0 ? 'conforme' : 'non conforme',
	}
}

/** The report as the terminal shows it. */
export function writeReport(report: Report): string {
	const lines = [
		`Crawl des interfaces de ${report.target}`,
		`${report.addresses} adresses, ${report.screens.join(' et ')}, ${report.pagesRead} pages lues, ${report.requests} requêtes.`,
	]
	for (const page of report.pages)
		for (const defect of page.defects)
			lines.push(`  [${page.screen}] ${page.address} : ${defect.kind} : ${defect.detail}`)
	lines.push(report.defectCount === 0 ? 'Aucun défaut : conforme.' : `${report.defectCount} défaut(s) : non conforme.`)
	return lines.join('\n')
}

/** The command: 0 no defect, 1 a defect, 2 refused. */
export async function run(
	variables: Variables,
	write: (line: string) => void = line => console.log(line)
): Promise<number> {
	let settings: Settings
	try {
		settings = readSettings(variables)
	} catch (error) {
		if (error instanceof TargetRefused || error instanceof CrawlRefused) {
			write(error.message)
			return 2
		}
		throw error
	}
	write(`Crawl de ${settings.target.origin} : ${CRAWL_ADDRESS_COUNT} adresses, deux largeurs d’écran, lectures seules.`)
	const report = await crawl({ settings })
	write(writeReport(report))
	if (settings.output) writeFileSync(settings.output, `${JSON.stringify(report, null, 2)}\n`)
	return report.verdict === 'conforme' ? 0 : 1
}
