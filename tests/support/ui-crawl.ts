/**
 * The crawl of the interfaces (ticket 177, plan 02 §10.1 point 2, docs/tests/crawl-interfaces.md): a robot opens
 * 40 addresses of the site at two screen widths and reports what the tests by journey do not see.
 *
 * This file holds what the two users of the crawl share:
 *  - the bench, as the end-to-end spec tests/e2e/ui-crawl.spec.ts runs it;
 *  - the command `bun run cutover:ui-crawl` (scripts/cutover/ui-crawl.ts), which reads a production host.
 *
 * Two halves. A pure half, tested without a browser (tests/unit/ui-crawl.test.ts): the list of the 40
 * addresses and `findDefects`, which turns the facts read on one page into a list of defects. A browser
 * half, `crawlPage`, which opens one address in a Playwright page and reads those facts.
 *
 * Nothing here writes to a site: `crawlPage` only navigates and scrolls.
 */

import type { Page } from '@playwright/test'
import { deliveredStaticPages } from '../../src/lib/seo/sitemap'

/** The two screen widths of the crawl: the reference phone width of the v3 (docs/qualite.md) and a desktop. */
export const CRAWL_SCREENS = {
	mobile: { width: 390, height: 844 },
	desktop: { width: 1440, height: 900 },
} as const

export type CrawlScreen = keyof typeof CRAWL_SCREENS

/** How many addresses a crawl visits. */
export const CRAWL_ADDRESS_COUNT = 40

/** An address that no route serves: the crawl checks that the 404 page is as clean as the others. */
export const UNKNOWN_PATH = '/une-page-qui-n-existe-pas'

/** The accessible name of the main navigation: the page has exactly one. */
export const NAV_NAME = 'Navigation principale'

/** The search addresses of the crawl: nothing typed, a city, a word, both, and a word nobody has. */
export const SEARCH_PATHS: readonly string[] = [
	'/search',
	'/search?city=Paris',
	'/search?search=mariage',
	'/search?search=mariage&city=Lyon',
	'/search?search=zzzqxw',
]

export interface CrawlAddress {
	path: string
	/** The status the address answers: 200 for a page, 404 for the unknown one. */
	expectedStatus: number
}

const SITEMAP_SHARES = [
	{ prefix: '/profil/', count: 9 },
	{ prefix: '/talent/', count: 4 },
	{ prefix: '/blog/', count: 4 },
] as const

/**
 * The 40 addresses of a crawl: the fixed pages the site delivers, the five searches, the plan of the site, the
 * thank-you page, an unknown address, then profiles, talents and articles taken in the order of the sitemap
 * (`sitemapPaths`) until there are 40. A family that has fewer pages than its share leaves the room to the
 * next ones; fewer than 40 addresses in all is an error, never a shorter crawl.
 *
 * The pages of the space (`/auth/...`) are not in the list: they have no main navigation by design, and the
 * crawl asks every page for one.
 */
export function crawlAddresses(sitemapPaths: readonly string[]): CrawlAddress[] {
	const fixed = [
		...deliveredStaticPages().map(page => page.chemin),
		...SEARCH_PATHS,
		'/site-map',
		'/demande-envoyee',
	].map(path => ({ path, expectedStatus: 200 }))
	const result: CrawlAddress[] = [...fixed, { path: UNKNOWN_PATH, expectedStatus: 404 }]
	const taken = new Set(result.map(address => address.path))
	const room = CRAWL_ADDRESS_COUNT - result.length

	const families = SITEMAP_SHARES.map(({ prefix, count }) => ({
		count,
		paths: [...new Set(sitemapPaths)].filter(path => path.startsWith(prefix) && path.length > prefix.length),
	}))
	const picked: string[] = []
	for (const family of families) picked.push(...family.paths.slice(0, family.count))
	// What a short family leaves, given to the others in the same order.
	for (const family of families) {
		for (const path of family.paths) {
			if (picked.length >= room) break
			if (!picked.includes(path)) picked.push(path)
		}
	}
	for (const path of picked.slice(0, room)) if (!taken.has(path)) result.push({ path, expectedStatus: 200 })

	if (result.length < CRAWL_ADDRESS_COUNT)
		throw new Error(
			`Le crawl a besoin de ${CRAWL_ADDRESS_COUNT} adresses : il y a ${fixed.length + 1} adresses fixes et le sitemap complète avec ${result.length - fixed.length - 1} profils, talents et articles, il en manque ${CRAWL_ADDRESS_COUNT - result.length}.`
		)
	return result
}

/* ------------------------------------------------------------------------------------------
 * What is read on a page, and what is a defect
 * ---------------------------------------------------------------------------------------- */

/** What the crawl reads on one page, once it has loaded and been scrolled to the bottom. */
export interface PageFacts {
	status: number
	/** Messages of the console at the error level, and uncaught errors of the page. */
	consoleErrors: string[]
	h1Count: number
	navCount: number
	/** The text a visitor can read (`innerText` of the body). */
	text: string
	/** `scrollWidth - clientWidth` of the page: above 0, it scrolls sideways. */
	overflow: number
	/** Selectors of elements that go past the right edge (at most three), to find the cause. */
	overflowing: string[]
	/** Images that did not load: a source (query left out) each. */
	brokenImages: string[]
	/** Requests that did not go: a different origin, a write, a path the crawl never reads. */
	blockedRequests: string[]
}

export type DefectKind =
	| 'status'
	| 'console-error'
	| 'h1'
	| 'nav'
	| 'visible-text'
	| 'overflow'
	| 'broken-image'
	| 'blocked-request'

export interface Defect {
	kind: DefectKind
	detail: string
}

/** The words that must never show on a page: a value the code did not fill in. `[object Object]` too. */
export const FORBIDDEN_TEXT = /\b(?:undefined|null)\b|\[object Object\]|\bNaN\b/g

/** What is wrong on one page; an empty list is a clean page. */
export function findDefects(facts: PageFacts, expectedStatus = 200): Defect[] {
	const defects: Defect[] = []
	if (facts.status >= 500) defects.push({ kind: 'status', detail: `réponse ${facts.status}` })
	else if (facts.status !== expectedStatus)
		defects.push({ kind: 'status', detail: `réponse ${facts.status} au lieu de ${expectedStatus}` })
	for (const message of facts.consoleErrors) defects.push({ kind: 'console-error', detail: message })
	if (facts.h1Count !== 1) defects.push({ kind: 'h1', detail: `${facts.h1Count} h1 au lieu d’un seul` })
	if (facts.navCount !== 1)
		defects.push({ kind: 'nav', detail: `${facts.navCount} « ${NAV_NAME} » au lieu d’une seule` })
	const words = [...new Set(facts.text.match(FORBIDDEN_TEXT) ?? [])]
	if (words.length > 0) defects.push({ kind: 'visible-text', detail: `texte visible : ${words.join(', ')}` })
	if (facts.overflow > 0)
		defects.push({
			kind: 'overflow',
			detail: `la page déborde de ${facts.overflow} px${facts.overflowing.length > 0 ? ` (${facts.overflowing.join(', ')})` : ''}`,
		})
	for (const source of facts.brokenImages) defects.push({ kind: 'broken-image', detail: source })
	for (const request of facts.blockedRequests) defects.push({ kind: 'blocked-request', detail: request })
	return defects
}

/* ------------------------------------------------------------------------------------------
 * The browser half
 * ---------------------------------------------------------------------------------------- */

/** Longest wait for a page to load. */
export const PAGE_DELAY_MS = 30_000

/** Longest wait, after the scroll, for the images to finish loading. */
export const IMAGE_DELAY_MS = 5_000

/** What the page reports about itself, read inside the browser. Pure DOM: no import, it is serialised. */
function readDom(args: { navName: string; imageDelay: number }) {
	const scrollToEnd = async () => {
		const step = Math.max(200, Math.floor(window.innerHeight * 0.8))
		for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
			window.scrollTo(0, y)
			await new Promise(resolve => setTimeout(resolve, 60))
		}
		window.scrollTo(0, document.documentElement.scrollHeight)
	}
	const loadedImages = async () => {
		const deadline = Date.now() + args.imageDelay
		const pending = () => [...document.images].filter(image => image.currentSrc !== '' && !image.complete)
		while (pending().length > 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100))
	}
	const selectorOf = (element: Element): string => {
		const id = element.id ? `#${element.id}` : ''
		const classes = [...element.classList].slice(0, 2)
		return `${element.tagName.toLowerCase()}${id}${classes.map(name => `.${name}`).join('')}`
	}
	const withoutQuery = (source: string): string => {
		try {
			const url = new URL(source, document.baseURI)
			return `${url.pathname}`
		} catch {
			return source
		}
	}
	return (async () => {
		await scrollToEnd()
		await loadedImages()
		window.scrollTo(0, 0)
		const root = document.documentElement
		const overflow = root.scrollWidth - root.clientWidth
		const overflowing =
			overflow > 0
				? [...document.body.querySelectorAll('*')]
						.filter(element => element.getBoundingClientRect().right > root.clientWidth + 1)
						.slice(0, 3)
						.map(selectorOf)
				: []
		const broken = [...document.images]
			.filter(image => image.currentSrc !== '' && (!image.complete || image.naturalWidth === 0))
			.map(image => withoutQuery(image.currentSrc))
		return {
			h1Count: document.querySelectorAll('h1').length,
			navCount: document.querySelectorAll(`nav[aria-label="${args.navName}"]`).length,
			text: document.body.innerText,
			overflow,
			overflowing,
			brokenImages: [...new Set(broken)],
		}
	})()
}

export interface CrawlPageOptions {
	/** Requests the page asked that the caller refused, filled by its own route (see scripts/cutover/ui-crawl.ts). */
	blockedRequests?: () => string[]
	/** Console messages to leave out: none by default, every error counts. */
	ignoreConsole?: (message: string) => boolean
}

/**
 * Opens `path` in `page`, scrolls to the bottom so that images load, and reads the facts of the page. The
 * page's own viewport sets the width. Errors of the console, uncaught errors and images that answer 4xx or 5xx are
 * counted from the first byte of the navigation to the end of the reading.
 */
export async function crawlPage(page: Page, path: string, options: CrawlPageOptions = {}): Promise<PageFacts> {
	const consoleErrors: string[] = []
	const failedImages: string[] = []
	const onConsole = (message: import('@playwright/test').ConsoleMessage) => {
		if (message.type() !== 'error') return
		const text = `${message.text()} ${message.location().url}`.trim()
		if (options.ignoreConsole?.(text)) return
		consoleErrors.push(text)
	}
	const onPageError = (error: Error) => consoleErrors.push(`Erreur non rattrapée : ${error.message}`)
	const onResponse = (response: import('@playwright/test').Response) => {
		if (response.request().resourceType() === 'image' && response.status() >= 400)
			failedImages.push(`${new URL(response.url()).pathname} (${response.status()})`)
	}
	page.on('console', onConsole)
	page.on('pageerror', onPageError)
	page.on('response', onResponse)
	try {
		const response = await page.goto(path, { waitUntil: 'load', timeout: PAGE_DELAY_MS })
		const dom = await page.evaluate(readDom, { navName: NAV_NAME, imageDelay: IMAGE_DELAY_MS })
		return {
			status: response?.status() ?? 0,
			consoleErrors,
			...dom,
			brokenImages: [...new Set([...dom.brokenImages, ...failedImages])],
			blockedRequests: options.blockedRequests?.() ?? [],
		}
	} finally {
		page.off('console', onConsole)
		page.off('pageerror', onPageError)
		page.off('response', onResponse)
	}
}
