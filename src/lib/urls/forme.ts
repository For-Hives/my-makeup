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

import { FROZEN_URL_FAMILIES, UNFROZEN_PREFIXES } from '../urls-gelees'

export interface RedirectionDeForme {
	/** The path to go to, with no query. */
	chemin: string
	status: 301 | 308
}

/** `/toutes-les-news` → `/blog`: the literal addresses the frozen table moves, read from it. */
function lireLesRedirectionsDeChemin(): ReadonlyMap<string, string> {
	const redirections = new Map<string, string>()
	for (const famille of FROZEN_URL_FAMILIES) {
		if (famille.rule !== undefined || famille.origins !== undefined || !famille.redirect) continue
		const destination = /^`(\/[^`<>*]*)`$/.exec(famille.redirect.to)?.[1]
		if (destination === undefined) continue
		for (const modele of famille.patterns) {
			if (!/[<>*]/.test(modele)) redirections.set(modele, destination)
		}
	}
	return redirections
}

/** The addresses of the site the frozen table redirects to another address of the site. */
export const REDIRECTIONS_DE_CHEMIN: ReadonlyMap<string, string> = lireLesRedirectionsDeChemin()

const sousUnPrefixeLibre = (chemin: string): boolean =>
	UNFROZEN_PREFIXES.some(prefixe => chemin === prefixe || chemin.startsWith(`${prefixe}/`))

/**
 * The redirect an address gets for its shape, or `null` when its shape is right (the page answers).
 * `chemin` is the path as the visitor wrote it, repeated slashes included.
 */
export function redirectionDeForme(chemin: string): RedirectionDeForme | null {
	const propre = chemin.replace(/\/{2,}/g, '/')
	if (sousUnPrefixeLibre(propre)) return null
	const doubleBarre = propre !== chemin
	const barreFinale = propre.length > 1 && propre.endsWith('/')
	const sansBarreFinale = barreFinale ? propre.replace(/\/+$/, '') || '/' : propre
	const destination = REDIRECTIONS_DE_CHEMIN.get(sansBarreFinale)
	if (destination !== undefined) return { chemin: destination, status: doubleBarre ? 301 : barreFinale ? 308 : 301 }
	if (!doubleBarre && !barreFinale) return null
	return { chemin: sansBarreFinale, status: doubleBarre ? 301 : 308 }
}
