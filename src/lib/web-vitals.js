/**
 * Field Web Vitals sent to Umami as a `web-vitals` event (MES-10, plans/04
 * §3.1, monthly review): one event per metric of a sampled page load, with
 * its name, its rounded value, its rating and the page (path only).
 */

export const WEB_VITALS_EVENT = 'web-vitals'
export const DEFAULT_WEB_VITALS_SAMPLE = 0.1

// web.dev thresholds: good up to the first value, poor above the second
export const WEB_VITALS_THRESHOLDS = {
	CLS: [0.1, 0.25],
	FCP: [1800, 3000],
	INP: [200, 500],
	LCP: [2500, 4000],
	TTFB: [800, 1800],
}

const RATINGS = ['good', 'needs-improvement', 'poor']
const PAGE_MAX = 99

/**
 * Share of page loads that send their Web Vitals, from
 * NEXT_PUBLIC_WEB_VITALS_SAMPLE: a number from 0 to 1 (0.1 = 10 %); empty or
 * invalid: 0.1.
 * @param {unknown} raw
 * @returns {number}
 */
export function webVitalsSampleRate(raw) {
	if (raw === undefined || raw === null || String(raw).trim() === '')
		return DEFAULT_WEB_VITALS_SAMPLE
	const rate = Number(raw)
	return Number.isFinite(rate) && rate >= 0 && rate <= 1
		? rate
		: DEFAULT_WEB_VITALS_SAMPLE
}

/**
 * Whether this page load sends its Web Vitals: drawn once per page load, so
 * that a sampled visit sends all its metrics and the others none.
 * @param {unknown} raw - NEXT_PUBLIC_WEB_VITALS_SAMPLE
 * @param {number} random - Math.random()
 * @returns {boolean}
 */
export function webVitalsSampled(raw, random) {
	return random < webVitalsSampleRate(raw)
}

/**
 * @param {string} name - CLS, FCP, INP, LCP or TTFB
 * @param {number} value
 * @returns {'good'|'needs-improvement'|'poor'}
 */
export function webVitalRating(name, value) {
	const [good, poor] = WEB_VITALS_THRESHOLDS[name]
	if (value <= good) return 'good'
	return value <= poor ? 'needs-improvement' : 'poor'
}

/**
 * Path of a page without query string nor hash, at most 99 characters.
 * @param {unknown} page - location.pathname
 * @returns {string|null}
 */
export function webVitalPage(page) {
	if (typeof page !== 'string' || !page.startsWith('/')) return null
	return page.split(/[?#]/)[0].slice(0, PAGE_MAX)
}

/**
 * Properties of the `web-vitals` event for a metric of next/web-vitals, or
 * null for a metric we do not send (FID, Next.js custom marks) or an
 * invalid value. CLS keeps 3 decimals, the others are whole milliseconds.
 * The rating comes from the metric, else from the thresholds.
 * @param {{name?: string, value?: number, rating?: string}} metric
 * @param {string} page - path of the page that was loaded
 * @returns {{name: string, value: number, rating: string, page: string}|null}
 */
export function webVitalData(metric, page) {
	if (!metric || typeof metric !== 'object') return null
	const { name, value, rating } = metric
	if (!Object.prototype.hasOwnProperty.call(WEB_VITALS_THRESHOLDS, name))
		return null
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
		return null
	const path = webVitalPage(page)
	if (path === null) return null
	return {
		name,
		value: name === 'CLS' ? Math.round(value * 1000) / 1000 : Math.round(value),
		rating: RATINGS.includes(rating) ? rating : webVitalRating(name, value),
		page: path,
	}
}
