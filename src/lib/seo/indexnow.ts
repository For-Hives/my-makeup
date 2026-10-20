import { SITE_ORIGIN } from '../frozen-urls'
import { PUBLIC_PAGES, type PublicContent, type PublicState } from '../revalidate'
import { estUnSlug } from '../slug'
import { canonicalUrl } from './url'

/**
 * IndexNow (ticket 219; plan 03 SEO-28): when a public page changes, the engines of the protocol
 * (Bing, Yandex, Seznam, Naver, Yep; not Google) are told its address, where the refresh of the pages
 * happens (src/collections/revalidate.ts).
 *
 * - The key is the variable INDEXNOW_KEY, never a file of the repository. The site serves it at
 *   `/<key>.txt` (src/app/api/indexnow/[key]/route.ts). Without the variable, nothing is served and
 *   nothing is sent.
 * - Only the main host is ever named: every address is built from `SITE_ORIGIN`, and one that is not
 *   an https address of that host is dropped before the request.
 * - Nothing is sent from the test bench or a work station: the apex is not the
 *   address they are served from (`keyIfSubmitAllowed`).
 * - A failed request never undoes a save: it leaves a line in the log, with no key and no address.
 *
 * No `next` import: this file is loaded by the Payload CLI, outside of Next, and tested without it.
 */

/** The endpoint shared by all the engines of the protocol: one request reaches them all. */
export const SUBMIT_ENDPOINT = 'https://api.indexnow.org/indexnow'

/** The key as the frozen address `/<clé>.txt` allows it (docs/migration/URLS.md): 32 hexadecimal characters. */
export const KEY_FORMAT = /^[0-9a-f]{32}$/

/** The protocol takes at most 10 000 addresses in one request. */
export const URLS_PER_SUBMISSION = 10_000

/**
 * The wait before a request leaves, so that the save is committed when an engine comes to read the
 * page, and so that the addresses of several saves close together leave in one request.
 */
export const DELAY_BEFORE_SUBMIT_MS = 5000

/** Past this, a request is given up. */
export const SUBMIT_MAX_DELAY_MS = 10_000

/** The key of the variable, or nothing: unset, blank or unreadable. Read alone, like the other optional variables. */
export function indexNowKey(valeur: string | undefined = process.env.INDEXNOW_KEY): string | undefined {
	const key = valeur?.trim()
	return key !== undefined && KEY_FORMAT.test(key) ? key : undefined
}

/** What the decision to send reads from the environment of the server. */
export interface SubmitEnv {
	INDEXNOW_KEY?: string | undefined
	NEXT_PUBLIC_SITE_URL?: string | undefined
	APP_ENV?: string | undefined
}

/**
 * The key to send under, or nothing when nothing must leave: no key, a server that is not the site
 * itself (a work station, the test bench), or an environment that says it is the bench.
 */
export function keyIfSubmitAllowed(
	env: SubmitEnv = {
		INDEXNOW_KEY: process.env.INDEXNOW_KEY,
		NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
		APP_ENV: process.env.APP_ENV,
	}
): string | undefined {
	if (env.NEXT_PUBLIC_SITE_URL !== SITE_ORIGIN) return undefined
	if (env.APP_ENV?.trim() === 'test') return undefined
	return indexNowKey(env.INDEXNOW_KEY)
}

/** Where the engines read the key: the file at the root of the main host. */
export const keyLocation = (cle: string): string => `${SITE_ORIGIN}/${cle}.txt`

/** True for an https address of the main host, and nothing else. */
export function isSiteUrl(adresse: string): boolean {
	if (!URL.canParse(adresse)) return false
	const url = new URL(adresse)
	return url.protocol === 'https:' && url.origin === SITE_ORIGIN
}

/**
 * The addresses to tell the engines about for one save of a document, from its public state before
 * and after: the page of each version that was or is in the sitemap, so the old address and the new
 * one when the slug changed, and the address of a page that leaves the sitemap. Never a list page.
 * Nothing when the document was and is out of the sitemap, or has no real slug yet.
 */
export function changedUrls(contenu: PublicContent, avant: PublicState | null, apres: PublicState | null): string[] {
	const inSitemap = [avant, apres].filter(
		(etat): etat is PublicState => etat !== null && etat.indexable !== false && etat.visible
	)
	const slugs = [...new Set(inSitemap.map(({ slug }) => slug))].filter(estUnSlug)
	return slugs.map(slug => canonicalUrl(PUBLIC_PAGES[contenu].page(slug))).filter(isSiteUrl)
}

/** The addresses a sitemap lists (`<loc>`), the ones of the main host only. */
export function sitemapUrls(xml: string): string[] {
	const decode = (texte: string) => texte.replace(/&amp;/g, '&')
	const locs = [...xml.matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/g)].map(([, queuedUrl]) => decode(queuedUrl ?? ''))
	return [...new Set(locs.filter(isSiteUrl))]
}

/** The part of `fetch` the sending reads. */
export type Fetcher = (adresse: string, options: RequestInit) => Promise<Pick<Response, 'status'>>

/** The log line of the sending: counts only, never the key and never an address. */
export interface Logger {
	info: (message: string) => void
	error: (message: string) => void
}

/**
 * Tells the engines about these addresses, in as many requests as the protocol needs (10 000 each).
 * Throws on a refusal or a network error, naming the status and never the key. 200 and 202 are
 * the answers of success.
 */
export async function submitToIndexNow(
	adresses: readonly string[],
	cle: string,
	chercher: Fetcher = fetch
): Promise<void> {
	const toSubmit = [...new Set(adresses.filter(isSiteUrl))]
	for (let start = 0; start < toSubmit.length; start += URLS_PER_SUBMISSION) {
		const response = await chercher(SUBMIT_ENDPOINT, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
			body: JSON.stringify({
				host: new URL(SITE_ORIGIN).host,
				key: cle,
				keyLocation: keyLocation(cle),
				urlList: toSubmit.slice(start, start + URLS_PER_SUBMISSION),
			}),
			signal: AbortSignal.timeout(SUBMIT_MAX_DELAY_MS),
		})
		if (response.status !== 200 && response.status !== 202) throw new Error(`IndexNow a répondu ${response.status}`)
	}
}

/** What the queue needs, all replaceable by a test. */
export interface QueueDependencies {
	cle: string
	journal: Logger
	chercher?: Fetcher
	delaiMs?: number
}

const pending = new Set<string>()
let timer: ReturnType<typeof setTimeout> | undefined
let dependencies: QueueDependencies | undefined

/**
 * Sends what is waiting, in one go. Never throws: a failure is logged and the addresses are given up
 * (the next change of the page tells the engines again).
 */
export async function flushQueue(): Promise<void> {
	if (timer !== undefined) clearTimeout(timer)
	timer = undefined
	const urls = [...pending]
	pending.clear()
	const current = dependencies
	if (urls.length === 0 || current === undefined) return
	try {
		await submitToIndexNow(urls, current.cle, current.chercher)
		current.journal.info(`[indexnow] ${urls.length} address(es) sent`)
	} catch (error) {
		const reason = error instanceof Error ? error.message : 'unknown error'
		current.journal.error(`[indexnow] ${urls.length} address(es) not sent: ${reason}`)
	}
}

/**
 * Puts addresses in the queue; they leave together after a short wait, in one request, whatever the
 * number of saves that asked. The wait never keeps the process alive.
 */
export function reportLater(adresses: readonly string[], deps: QueueDependencies): void {
	const valid = adresses.filter(isSiteUrl)
	if (valid.length === 0) return
	for (const queuedUrl of valid) pending.add(queuedUrl)
	dependencies = deps
	if (timer !== undefined) return
	timer = setTimeout(() => void flushQueue(), deps.delaiMs ?? DELAY_BEFORE_SUBMIT_MS)
	timer.unref?.()
}

/** The addresses waiting to leave. For the tests. */
export const pendingUrls = (): string[] => [...pending]

/** Forgets what is waiting, without sending. For the tests. */
export function forgetQueue(): void {
	if (timer !== undefined) clearTimeout(timer)
	timer = undefined
	pending.clear()
	dependencies = undefined
}
