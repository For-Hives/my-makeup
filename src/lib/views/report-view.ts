/**
 * The browser side of the counter of views (ticket 1001): one call per profile and per tab.
 *
 * The tab remembers in its `sessionStorage` that it already told this profile (a key of the tab, not a
 * cookie, and nothing of it is ever sent): a reload counts nothing, a second tab counts again. An
 * automated browser, and a browser that opted out of the measure, say nothing.
 *
 * No import from the server: the component hands in the browser's tools, a test hands in its own.
 */

export const VIEW_KEY_PREFIX = 'mm.view:'

/**
 * The route the profile page calls once per tab (src/app/api/profile-views/route.ts). It lives here, in a file
 * with no import, because the browser component reads it: from `profile-views.ts` it would drag the statistics
 * (zod, `node:crypto`, the lists of countries) into the JavaScript of every profile page (issue 1033).
 */
export const PROFILE_VIEWS_PATH = '/api/profile-views'

export interface ReportEnvironment {
	slug: string
	storage: Pick<Storage, 'getItem' | 'setItem'> | undefined
	send: (body: { slug: string }) => void
	/** `navigator.webdriver`. */
	automated: boolean
	/** The opt-out key of the measure (src/lib/analytics/opt-out.ts). */
	refused: boolean
}

/** Tells the server once; true when the call went out. Never throws: a count must not break a page. */
export function reportProfileView({ slug, storage, send, automated, refused }: ReportEnvironment): boolean {
	if (automated || refused) return false
	const key = `${VIEW_KEY_PREFIX}${slug}`
	try {
		if (storage?.getItem(key)) return false
		storage?.setItem(key, '1')
	} catch {
		// The storage is blocked: the page cannot tell a reload from a visit, and counts.
	}
	try {
		send({ slug })
		return true
	} catch {
		return false
	}
}
