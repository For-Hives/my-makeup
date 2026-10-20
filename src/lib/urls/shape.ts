/**
 * The shape of an address (ticket 072; plan 02 U62 and U64; docs/migration/URLS.md, « Forme de
 * l'adresse »): a repeated slash and a final slash are read before any page, and answered with ONE
 * redirect to the final address.
 *
 * - A path with `//` answers 301 to the same path with no repeated slash.
 * - A path that ends with `/` answers 308 to the same path without it.
 * - Both at once answer 301, in one hop.
 * - An address whose own rule redirects (`/toutes-les-news` → `/blog`, from the frozen table) goes
 *   straight to the destination of that rule, never through the normalised path first.
 * - The query string is kept as it is, and so is the case: `/Blog` is an unknown address.
 * - Nothing under `/admin`, `/api` or `/_next` is touched (U64): those are Payload's and Next's.
 *
 * Next would answer the final slash itself, with a 308, and a repeated slash with a 308 as well:
 * next.config.ts turns that off (`skipTrailingSlashRedirect`) so that this function is the only one
 * that answers, in one hop.
 *
 * No `next` import: the proxy and the tests read this file.
 */

import { FROZEN_URL_FAMILIES, UNFROZEN_PREFIXES } from '../frozen-urls'

export interface ShapeRedirect {
	/** The path to go to, with no query. */
	chemin: string
	status: 301 | 308
}

/** `/toutes-les-news` → `/blog`: the literal addresses the frozen table moves, read from it. */
function readPathRedirects(): ReadonlyMap<string, string> {
	const redirects = new Map<string, string>()
	for (const family of FROZEN_URL_FAMILIES) {
		if (family.rule !== undefined || family.origins !== undefined || !family.redirect) continue
		const destination = /^`(\/[^`<>*]*)`$/.exec(family.redirect.to)?.[1]
		if (destination === undefined) continue
		for (const pattern of family.patterns) {
			if (!/[<>*]/.test(pattern)) redirects.set(pattern, destination)
		}
	}
	return redirects
}

/** The addresses of the site the frozen table redirects to another address of the site. */
export const PATH_REDIRECTS: ReadonlyMap<string, string> = readPathRedirects()

const underFreePrefix = (chemin: string): boolean =>
	UNFROZEN_PREFIXES.some(prefixe => chemin === prefixe || chemin.startsWith(`${prefixe}/`))

/**
 * The redirect an address gets for its shape, or `null` when its shape is right (the page answers).
 * `chemin` is the path as the visitor wrote it, repeated slashes included.
 */
export function shapeRedirect(chemin: string): ShapeRedirect | null {
	const clean = chemin.replace(/\/{2,}/g, '/')
	if (underFreePrefix(clean)) return null
	const doubleSlash = clean !== chemin
	const trailingSlash = clean.length > 1 && clean.endsWith('/')
	const withoutTrailingSlash = trailingSlash ? clean.replace(/\/+$/, '') || '/' : clean
	const destination = PATH_REDIRECTS.get(withoutTrailingSlash)
	if (destination !== undefined) return { chemin: destination, status: doubleSlash ? 301 : trailingSlash ? 308 : 301 }
	if (!doubleSlash && !trailingSlash) return null
	return { chemin: withoutTrailingSlash, status: doubleSlash ? 301 : 308 }
}
