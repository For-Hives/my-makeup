/**
 * Does the page of this address exist? Asked by the proxy before the page runs (ticket 231). The reads are
 * those of the pages (src/services/public/cached.ts); what exists is remembered for a minute by the process
 * (`memoireDesPagesQuiExistent`), because Next's cache keeps nothing from the proxy. An unknown address is read
 * at each visit, as the pages read it.
 */

import config from '@payload-config'
import { getPayload } from 'payload'
import { type FamilleVerifiee, memoireDesPagesQuiExistent } from '@/lib/urls/page-inconnue'
import { cachedProfileUrl, cachedArticle, cachedTalent } from './cached'

const memory = memoireDesPagesQuiExistent()

/** False only for an address the page would answer with its 404; a redirection of a profile is a page. */
export async function pageExists(famille: FamilleVerifiee, segment: string): Promise<boolean> {
	const key = `${famille}:${segment}`
	if (memory.connait(key)) return true
	const payload = await getPayload({ config })
	const exists =
		famille === 'profil'
			? (await cachedProfileUrl(payload, segment)).type !== 'inconnue'
			: famille === 'talent'
				? (await cachedTalent(payload, segment)) !== null
				: (await cachedArticle(payload, segment)) !== null
	if (exists) memory.retenir(key)
	return exists
}
