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

export type FamilleVerifiee = 'profil' | 'talent' | 'blog'

const FAMILLES: readonly FamilleVerifiee[] = ['profil', 'talent', 'blog']

/** The segment as the visitor wrote it: Next gives it decoded or not, depending on the path. */
export function segmentEcrit(segment: string): string {
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
export function adresseAVerifier(
	chemin: string,
	methode: string
): { famille: FamilleVerifiee; segment: string } | null {
	if (methode !== 'GET' && methode !== 'HEAD') return null
	const morceaux = chemin.split('/')
	// ['', 'profil', '<segment>']
	if (morceaux.length !== 3 || morceaux[0] !== '') return null
	const [, famille, segment] = morceaux
	if (!segment || !FAMILLES.includes(famille as FamilleVerifiee)) return null
	return { famille: famille as FamilleVerifiee, segment: segmentEcrit(segment) }
}

/** How long the proxy trusts « this page exists »: one minute. */
export const DUREE_DE_MEMOIRE_MS = 60_000
/** The most addresses the proxy remembers: only pages that exist are kept, so this is far above the catalogue. */
export const TAILLE_MAX_DE_MEMOIRE = 5_000

/**
 * What the proxy remembers of the pages that exist (ticket 231). The reads of Next's cache (`unstable_cache`) do
 * not keep anything when they run in the proxy, so without this every visit of a profile, talent or article would
 * read the database once more than before the ticket (ticket 117: a second visit of an unchanged page reads
 * nothing). Only « exists » is remembered, and only for a minute: an address that is not there yet is read at each
 * visit, so that a page that appears is never answered 404, and a page hidden meanwhile still answers its
 * own 404 (the page keeps its `notFound()`).
 */
export function memoireDesPagesQuiExistent(
	{ dureeMs = DUREE_DE_MEMOIRE_MS, tailleMax = TAILLE_MAX_DE_MEMOIRE }: { dureeMs?: number; tailleMax?: number } = {},
	maintenant: () => number = Date.now
) {
	const finDeVie = new Map<string, number>()
	return {
		/** True when the address was found to exist less than `dureeMs` ago. */
		connait(cle: string): boolean {
			const fin = finDeVie.get(cle)
			if (fin === undefined) return false
			if (fin > maintenant()) return true
			finDeVie.delete(cle)
			return false
		},
		retenir(cle: string): void {
			const t = maintenant()
			if (finDeVie.size >= tailleMax && !finDeVie.has(cle)) {
				for (const [autre, fin] of finDeVie) if (fin <= t) finDeVie.delete(autre)
				// Still full: the oldest entry goes (a Map keeps the order of insertion).
				if (finDeVie.size >= tailleMax) finDeVie.delete(finDeVie.keys().next().value as string)
			}
			finDeVie.delete(cle)
			finDeVie.set(cle, t + dureeMs)
		},
		get taille(): number {
			return finDeVie.size
		},
	}
}
