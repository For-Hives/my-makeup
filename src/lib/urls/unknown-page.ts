/**
 * Which addresses the proxy checks before the page runs (ticket 231).
 *
 * A 404 raised by `notFound()` inside a page reaches the browser as an empty shell and a stream: the HTML of the
 * server holds its status, its title and its `noindex`, but not the h1 of the 404 page (Next sends `<html
 * id="__next_error__">` and lets the browser draw the page). An address nobody can serve is therefore answered
 * by the proxy, which rewrites it to a path no route holds: Next then renders the 404 page of the site in full
 * (src/app/global-not-found.tsx), h1 included, with the same status and `noindex`.
 *
 * Only the addresses whose slug can be unknown are checked: one segment under `/profil`, `/talent` or `/blog`,
 * asked with GET or HEAD. The pages keep their own `notFound()` for what the proxy could not know (a document
 * hidden between the two reads).
 *
 * No `next` import: the proxy and the tests read this file.
 */

export type CheckedFamily = 'profil' | 'talent' | 'blog'

/** What the proxy learns of an address: no page (`false`), a page (`true`), or the address to redirect to. */
export type PageAnswer = boolean | { vers: string }

const FAMILIES: readonly CheckedFamily[] = ['profil', 'talent', 'blog']

/** The segment as the visitor wrote it: Next gives it decoded or not, depending on the path. */
export function writtenSegment(segment: string): string {
	try {
		return decodeURIComponent(segment)
	} catch {
		return segment
	}
}

/**
 * The family and the segment to look up for a request, or `null` when the proxy has nothing to check:
 * another path, a second segment (`/blog/a/b` has no route), an empty segment, or a method other than GET and HEAD.
 */
export function urlToCheck(chemin: string, methode: string): { famille: CheckedFamily; segment: string } | null {
	if (methode !== 'GET' && methode !== 'HEAD') return null
	const chunks = chemin.split('/')
	// ['', 'profil', '<segment>']
	if (chunks.length !== 3 || chunks[0] !== '') return null
	const [, family, segment] = chunks
	if (!segment || !FAMILIES.includes(family as CheckedFamily)) return null
	return { famille: family as CheckedFamily, segment: writtenSegment(segment) }
}

/** How long the proxy trusts « this page exists »: one minute. */
export const MEMORY_DURATION_MS = 60_000
/** The most addresses the proxy remembers: only pages that exist are kept, so this is far above the catalogue. */
export const MEMORY_MAX_SIZE = 5_000

/**
 * What the proxy remembers of the pages that exist (ticket 231). The reads of Next's cache (`unstable_cache`) do
 * not keep anything when they run in the proxy, so without this every visit of a profile, talent or article would
 * read the database once more than before the ticket (ticket 117: a second visit of an unchanged page reads
 * nothing). Only « exists » is remembered, and only for a minute: an address that is not there yet is read at each
 * visit, so that a page that appears is never answered 404, and a page hidden meanwhile still answers its
 * own 404 (the page keeps its `notFound()`).
 */
export function existingPagesMemory(
	{ dureeMs = MEMORY_DURATION_MS, tailleMax = MEMORY_MAX_SIZE }: { dureeMs?: number; tailleMax?: number } = {},
	maintenant: () => number = Date.now
) {
	const expiresAt = new Map<string, number>()
	return {
		/** True when the address was found to exist less than `dureeMs` ago. */
		connait(cle: string): boolean {
			const end = expiresAt.get(cle)
			if (end === undefined) return false
			if (end > maintenant()) return true
			expiresAt.delete(cle)
			return false
		},
		retenir(cle: string): void {
			const t = maintenant()
			if (expiresAt.size >= tailleMax && !expiresAt.has(cle)) {
				for (const [other, end] of expiresAt) if (end <= t) expiresAt.delete(other)
				// Still full: the oldest entry goes (a Map keeps the order of insertion).
				if (expiresAt.size >= tailleMax) expiresAt.delete(expiresAt.keys().next().value as string)
			}
			expiresAt.delete(cle)
			expiresAt.set(cle, t + dureeMs)
		},
		get taille(): number {
			return expiresAt.size
		},
	}
}
