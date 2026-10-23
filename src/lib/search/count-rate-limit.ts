/**
 * The brake on the count of the searches (issue 1002): 60 counts a minute from one address, then the count is
 * dropped without a word (the visitor is never told, her search is not touched). The same figure as the
 * search itself (src/lib/search/rate-limit.ts), with its own counters. A request that did not come through the
 * proxy of the site (development, the bench) is never braked. The address is a key to count, never a line of a log.
 */

import { ipClient } from '@/lib/auth/client-ip'
import { createRateLimit, type RateLimit } from '@/lib/auth/rate-limit'
import { isLocalAddress } from './rate-limit'

export const searchCountRateLimit: RateLimit = createRateLimit({
	nom: 'compteur-recherche',
	limite: 60,
	fenetreMs: 60_000,
})

/** True when this request may add to the count. */
export function mayCountSearch(entetes: Headers, frein: RateLimit = searchCountRateLimit): boolean {
	const key = ipClient(entetes)
	return isLocalAddress(key) || frein.prendre(key).autorise
}
