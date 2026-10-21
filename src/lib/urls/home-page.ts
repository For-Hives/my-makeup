/**
 * Where the home page lives (ticket 269).
 *
 * A page at `/` cannot be kept out of the build, and the build has no database: it would be rendered there
 * with no talents and kept. The home page is therefore the one page of a dynamic segment that generates
 * nothing ahead, `src/app/(front)/(site)/home-cached/[key]/page.tsx`, and `next.config.ts` rewrites `/`
 * to it. The visitor never sees that address: the proxy answers it 404.
 *
 * No `next` import: next.config.ts, the proxy and the tests read this file.
 */

/** The only value of the segment that is a page. */
export const HOME_PAGE_KEY = 'principal'

/** The first segment of the internal address. */
export const HOME_PAGE_PREFIX = '/home-cached'

/** The internal address `/` is rewritten to. */
export const HOME_PAGE_PATH = `${HOME_PAGE_PREFIX}/${HOME_PAGE_KEY}`

/** True for the internal address and anything under it. */
export function isHomePageInternal(chemin: string): boolean {
	return chemin === HOME_PAGE_PREFIX || chemin.startsWith(`${HOME_PAGE_PREFIX}/`)
}
