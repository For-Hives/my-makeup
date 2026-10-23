/**
 * The daily counter of the views of a profile (ticket 1001). The rules, apart from the database and
 * from the request, so that the route, the dashboard, the statistics and the purge say the same thing.
 *
 * What is kept: one row per profile and per day (a day of Paris), with a number. Nothing says who
 * looked: no visitor identifier, no address, no user agent, no page of origin, no cookie.
 *
 * Relative imports on purpose: the Payload CLI and the scripts load this file outside of Next.
 */

import { parisDay } from '../weekly-stats'

export const PROFILE_VIEWS_COLLECTION = 'profile-views'

/** The route the profile page calls once per tab (src/app/api/profile-views/route.ts). */
export const PROFILE_VIEWS_PATH = '/api/profile-views'

/** The rows older than this many days are deleted every day: the longest period of the statistics route. */
export const VIEWS_RETENTION_DAYS = 92

/** What her space shows her. */
export const VIEWS_WINDOW_DAYS = 30

/** The longest slug the route reads: a longer one is no slug of ours. */
const SLUG_MAX = 200

const DAY_MS = 86_400_000

/** The body of a count: the slug of the page, nothing else. */
export function readViewBody(body: unknown): { slug: string } | undefined {
	if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined
	const keys = Object.keys(body)
	if (keys.length !== 1 || keys[0] !== 'slug') return undefined
	const slug = (body as { slug: unknown }).slug
	return typeof slug === 'string' && slug.length > 0 && slug.length <= SLUG_MAX ? { slug } : undefined
}

/** Known robots and tools. A request without any agent is not a browser either. */
const AUTOMATED =
	/bot\b|bot\/|crawl|spider|slurp|headless|phantom|lighthouse|curl|wget|python|java\/|go-http|okhttp|libwww|httpclient|axios|node-fetch|undici|preview|facebookexternalhit|monitor|uptime|scrapy/i

/** True when the agent is a robot, a tool, or absent: such a request is not a visit. */
export function isAutomatedAgent(userAgent: string | null | undefined): boolean {
	if (!userAgent) return true
	return AUTOMATED.test(userAgent)
}

/** The first day kept: rows of an earlier day are deleted (the day of Paris, 92 days back). */
export function viewsPurgeDay(now: Date): string {
	return parisDay(new Date(now.getTime() - VIEWS_RETENTION_DAYS * DAY_MS))
}

export interface ViewRow {
	day: string
	count: number
}

/** The last `days` days up to today, oldest first, a day with no view at zero. */
export function lastViewDays(rows: readonly ViewRow[], now: Date, days: number = VIEWS_WINDOW_DAYS): ViewRow[] {
	const byDay = new Map<string, number>()
	for (const { day, count } of rows) byDay.set(day, (byDay.get(day) ?? 0) + count)
	const result: ViewRow[] = []
	for (let back = days - 1; back >= 0; back--) {
		const day = parisDay(new Date(now.getTime() - back * DAY_MS))
		result.push({ day, count: byDay.get(day) ?? 0 })
	}
	return result
}
