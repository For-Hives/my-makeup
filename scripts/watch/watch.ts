/**
 * The continuous watch of the site (ticket 277, audit S4/M2): every 5 minutes, from outside the
 * Coolify host, it reads three addresses of the target and tells Andy when the site is down.
 *
 * - Read-only: GET only, one request at a time, redirects never followed, nothing under `/u`.
 * - A failure is a status other than 200, an answer later than 10 s, or a health answer without
 *   its version. Two failures in a row send one alert; the first success after that sends one
 *   message of end. A single failure only fails the run (GitHub then shows it red).
 * - Nothing is kept between two runs: the workflow hands over the conclusions of the previous
 *   runs (`WATCH_PREVIOUS`, newest first) and the streak is counted from them.
 * - The logs and the messages never carry a profile address (an 8-character fingerprint
 *   instead) nor the identifiers of the protected access.
 *
 * No dependency: the workflow runs it without `bun install`. Tested without any network in
 * tests/unit/watch.test.ts.
 */

import { createHash } from 'node:crypto'
import { probeTarget, RefusedTarget } from '../../tests/probes/guard'

export const HEALTH_PATH = '/api/health'
export const SITEMAP_PATH = '/sitemap.xml'
/** An answer later than this is a failure. */
export const SLOW_AFTER_MS = 10_000
/** Failures in a row that send the alert. */
export const ALERT_AFTER = 2

export const WATCH_AGENT = 'my-makeup-sonde-continue/1 (lecture seule)'
const PROFILE_PATH = /^\/profil\/[^/]+$/
const ERROR_CODE = /^[A-Za-z0-9_]{1,32}$/

/** What a run learns about one address. */
export interface CheckResult {
	/** Safe to write: `santé`, `accueil`, or `profil #<fingerprint>`. */
	label: string
	ok: boolean
	/** Why it failed, or nothing. Never an address, never an identifier. */
	reason?: string
	status?: number
	ms: number
}

export type Action = 'none' | 'alert' | 'recovery'

export interface Message {
	subject: string
	text: string
}

export type Notifier = (message: Message) => Promise<void>

export interface WatchOptions {
	env: Record<string, string | undefined>
	fetch?: typeof fetch
	notify?: Notifier
	log?: (line: string) => void
	now?: () => Date
	/** Test seam: the 10 s limit. */
	slowAfterMs?: number
}

/** First 8 hex digits of the SHA-256 of a path: the same name as in tests/probes/content.ts. */
export function fingerprint(path: string): string {
	return createHash('sha256').update(path).digest('hex').slice(0, 8)
}

/** The profile paths of a sitemap (`<loc>` of `/profil/<slug>`), origin dropped, no duplicate. */
export function sitemapProfiles(xml: string): string[] {
	const paths = new Set<string>()
	for (const [, loc = ''] of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)) {
		const decoded = loc.replace(/&(amp|lt|gt|quot|apos);/g, (_all, name: string) => {
			const table: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
			return table[name] ?? ''
		})
		if (!URL.canParse(decoded)) continue
		const { pathname } = new URL(decoded)
		if (PROFILE_PATH.test(pathname)) paths.add(pathname)
	}
	return [...paths]
}

/**
 * The profile the watch reads: the one with the smallest fingerprint. The choice is stable from
 * one run to the next (same page, same cache) until that profile leaves the sitemap.
 */
export function chooseProfile(paths: readonly string[]): string | undefined {
	return [...paths].sort((a, b) => fingerprint(a).localeCompare(fingerprint(b)) || a.localeCompare(b))[0]
}

/** `{ ok, version }` with a real version, as `/api/health` writes it when the database answers. */
export function healthHasVersion(body: string): boolean {
	try {
		const data: unknown = JSON.parse(body)
		if (typeof data !== 'object' || data === null) return false
		const { version } = data as { version?: unknown }
		return typeof version === 'string' && version.trim() !== '' && version !== 'unknown'
	} catch {
		return false
	}
}

/** The conclusions of the runs that said something about the site, newest first. */
export function parsePrevious(value: string | undefined): ('success' | 'failure')[] {
	return (value ?? '')
		.split(',')
		.map(item => item.trim())
		.filter((item): item is 'success' | 'failure' => item === 'success' || item === 'failure')
}

/** Failures in a row at the head of the previous conclusions. */
export function failureStreak(previous: readonly string[]): number {
	let streak = 0
	for (const conclusion of previous) {
		if (conclusion !== 'failure') break
		streak += 1
	}
	return streak
}

/** What this run owes Andy: one alert at the second failure in a row, one message when it ends. */
export function decide(previous: readonly string[], ok: boolean): { streak: number; action: Action } {
	const before = failureStreak(previous)
	if (ok) return { streak: 0, action: before >= ALERT_AFTER ? 'recovery' : 'none' }
	const streak = before + 1
	return { streak, action: streak === ALERT_AFTER ? 'alert' : 'none' }
}

const parisTime = (date: Date): string =>
	new Intl.DateTimeFormat('fr-FR', {
		timeZone: 'Europe/Paris',
		dateStyle: 'short',
		timeStyle: 'medium',
	}).format(date)

function failureText(results: readonly CheckResult[]): string {
	return results
		.filter(result => !result.ok)
		.map(result => `- ${result.label} : ${result.reason ?? 'échec'}`)
		.join('\n')
}

export function alertMessage(target: URL, results: readonly CheckResult[], at: Date, runUrl?: string): Message {
	return {
		subject: `Alerte My Makeup : ${target.host} ne répond plus`,
		text: [
			`La sonde lit ${target.host} toutes les 5 minutes. Deux lectures de suite ont échoué (dernière à ${parisTime(at)}, heure de Paris).`,
			'',
			failureText(results),
			'',
			'Un échec : un statut autre que 200, plus de 10 secondes, ou une santé sans version.',
			...(runUrl ? ['', `Détail : ${runUrl}`] : []),
		].join('\n'),
	}
}

export function recoveryMessage(target: URL, at: Date): Message {
	return {
		subject: `My Makeup : ${target.host} répond de nouveau`,
		text: `La sonde a relu ${target.host} sans échec à ${parisTime(at)} (heure de Paris). L'alerte est terminée.`,
	}
}

/** The reason to write for a failed read: a code or a fixed phrase, never the message of the error. */
function failureReason(error: unknown, aborted: boolean): string {
	if (aborted) return 'délai dépassé'
	const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
	return typeof code === 'string' && ERROR_CODE.test(code) ? `erreur réseau (${code})` : 'erreur réseau'
}

interface Reading {
	status?: number
	body?: string
	reason?: string
	ms: number
}

async function read(
	fetcher: typeof fetch,
	url: URL,
	headers: Record<string, string>,
	limitMs: number,
	now: () => Date
): Promise<Reading> {
	const started = now().getTime()
	const abort = new AbortController()
	const timer = setTimeout(() => abort.abort(), limitMs)
	try {
		const response = await fetcher(url, { method: 'GET', headers, redirect: 'manual', signal: abort.signal })
		const body = await response.text()
		return { status: response.status, body, ms: now().getTime() - started }
	} catch (error) {
		return { reason: failureReason(error, abort.signal.aborted), ms: now().getTime() - started }
	} finally {
		clearTimeout(timer)
	}
}

const statusReason = (status: number): string => `statut ${status}`

/** Reads the three addresses. Exported for the tests. */
export async function checkSite(
	target: URL,
	headers: Record<string, string>,
	fetcher: typeof fetch,
	limitMs: number,
	now: () => Date
): Promise<CheckResult[]> {
	const results: CheckResult[] = []
	const at = (path: string) => new URL(path, target)

	const health = await read(fetcher, at(HEALTH_PATH), headers, limitMs, now)
	results.push(
		judge('santé', health, reading => (healthHasVersion(reading.body ?? '') ? undefined : 'santé sans version'))
	)

	const home = await read(fetcher, at('/'), headers, limitMs, now)
	results.push(judge('accueil', home))

	const sitemap = await read(fetcher, at(SITEMAP_PATH), headers, limitMs, now)
	if (sitemap.reason !== undefined || sitemap.status !== 200) {
		const reason = sitemap.reason ?? statusReason(sitemap.status ?? 0)
		results.push({ label: 'profil', ok: false, reason: `plan du site illisible (${reason})`, ms: sitemap.ms })
		return results
	}
	const profile = chooseProfile(sitemapProfiles(sitemap.body ?? ''))
	if (profile === undefined) {
		// Nothing to read yet (the v3 before its import): not a failure of the site.
		results.push({ label: 'profil', ok: true, reason: 'aucun profil dans le plan du site (ignoré)', ms: sitemap.ms })
		return results
	}
	const page = await read(fetcher, at(profile), headers, limitMs, now)
	results.push(judge(`profil #${fingerprint(profile)}`, page))
	return results
}

function judge(label: string, reading: Reading, extra?: (reading: Reading) => string | undefined): CheckResult {
	const base = { label, ms: reading.ms, ...(reading.status === undefined ? {} : { status: reading.status }) }
	if (reading.reason !== undefined) return { ...base, ok: false, reason: reading.reason }
	if (reading.status !== 200) return { ...base, ok: false, reason: statusReason(reading.status ?? 0) }
	const problem = extra?.(reading)
	return problem === undefined ? { ...base, ok: true } : { ...base, ok: false, reason: problem }
}

/** Sends a message by Resend. The key goes in the header of this one request, nowhere else. */
export function resendNotifier(
	settings: { key: string; to: string; from: string },
	fetcher: typeof fetch = fetch
): Notifier {
	return async ({ subject, text }) => {
		const response = await fetcher('https://api.resend.com/emails', {
			method: 'POST',
			headers: { Authorization: `Bearer ${settings.key}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ from: settings.from, to: [settings.to], subject, text }),
		})
		if (!response.ok) throw new Error(`Resend a répondu ${response.status}`)
	}
}

function notifierFromEnv(env: WatchOptions['env'], fetcher: typeof fetch): Notifier | undefined {
	const key = env.WATCH_RESEND_KEY?.trim()
	const to = env.WATCH_ALERT_TO?.trim()
	if (!key || !to) return undefined
	return resendNotifier(
		{ key, to, from: env.WATCH_ALERT_FROM?.trim() || 'Sonde My Makeup <sonde@send.my-makeup.fr>' },
		fetcher
	)
}

function runUrl(env: WatchOptions['env']): string | undefined {
	const { GITHUB_SERVER_URL: server, GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: id } = env
	return server && repository && id ? `${server}/${repository}/actions/runs/${id}` : undefined
}

/**
 * One run. Exit code: 0 all three reads are good, 1 a read failed (or the alert could not be
 * sent), 2 the target is not an address the watch may read: nothing was sent.
 */
export async function run({
	env,
	fetch: fetcher = fetch,
	notify,
	log = line => console.log(line),
	now = () => new Date(),
	slowAfterMs = SLOW_AFTER_MS,
}: WatchOptions): Promise<number> {
	let target: URL
	try {
		if (!env.WATCH_TARGET?.trim())
			throw new RefusedTarget('WATCH_TARGET manque : la cible est un réglage, jamais une valeur par défaut.')
		target = probeTarget(env.WATCH_TARGET.trim())
	} catch (error) {
		if (!(error instanceof RefusedTarget)) throw error
		log(`[sonde] ${error.message}`)
		return 2
	}

	const headers: Record<string, string> = { 'User-Agent': WATCH_AGENT, 'Cache-Control': 'no-cache' }
	const user = env.WATCH_ACCESS_USER
	const password = env.WATCH_ACCESS_PASSWORD
	if (user && password) headers.Authorization = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`

	const results = await checkSite(target, headers, fetcher, slowAfterMs, now)
	log(`[sonde] ${now().toISOString()} cible ${target.host}`)
	for (const result of results) {
		const state = result.ok ? 'ok' : `ÉCHEC (${result.reason})`
		const status = result.status === undefined ? '' : ` statut ${result.status}`
		log(`[sonde] ${result.label}${status} ${result.ms} ms ${state}`)
	}

	const ok = results.every(result => result.ok)
	const { streak, action } = decide(parsePrevious(env.WATCH_PREVIOUS), ok)
	log(`[sonde] échecs de suite : ${streak}`)
	if (action === 'none') return ok ? 0 : 1

	const send = notify ?? notifierFromEnv(env, fetcher)
	const message =
		action === 'alert' ? alertMessage(target, results, now(), runUrl(env)) : recoveryMessage(target, now())
	try {
		if (!send) throw new Error('canal d’alerte non réglé (WATCH_RESEND_KEY, WATCH_ALERT_TO)')
		await send(message)
		log(action === 'alert' ? '[sonde] alerte envoyée' : '[sonde] message de fin envoyé')
	} catch (error) {
		const why = error instanceof Error ? error.message : 'erreur'
		// The message of Resend's error carries no key; a failed end message does not fail the run.
		log(`[sonde] ${action === 'alert' ? 'ALERTE NON ENVOYÉE' : 'message de fin non envoyé'} : ${why}`)
		if (action === 'alert') return 1
	}
	return ok ? 0 : 1
}
