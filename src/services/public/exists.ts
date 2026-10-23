/**
 * Does the page of this address exist? Asked by the proxy before the page runs (ticket 231). The reads are
 * those of the pages (src/services/public/cached.ts); what exists is remembered for a minute by the process
 * (`existingPagesMemory`), because Next's cache keeps nothing from the proxy. An unknown address is read
 * at each visit, as the pages read it.
 */

import config from '@payload-config'
import { getPayload } from 'payload'
import { profilePath } from '@/lib/slug'
import { type CheckedFamily, existingPagesMemory, type PageAnswer } from '@/lib/urls/unknown-page'
import { cachedArticle, cachedProfileUrl, cachedTalent } from './cached'

const memory = existingPagesMemory()

/**
 * What the page of this address answers, as far as the proxy needs to know: `false` for its 404, `true` for a page,
 * and for the old address of a profile (an old username, a variant of the slug) the address to send the visitor to.
 * The redirection is answered by the proxy, not by the page: a `permanentRedirect()` in a page kept in the cache of
 * Next (ticket 269) leaves with a doubled `Location` header.
 */
export async function pageExists(famille: CheckedFamily, segment: string): Promise<PageAnswer> {
	const key = `${famille}:${segment}`
	if (memory.connait(key)) return true
	const payload = await getPayload({ config })
	let answer: PageAnswer
	if (famille === 'profil') {
		const target = await cachedProfileUrl(payload, segment)
		answer =
			target.type === 'inconnue' ? false : target.type === 'redirection' ? { vers: profilePath(target.slug) } : true
	} else {
		answer =
			famille === 'talent'
				? (await cachedTalent(payload, segment)) !== null
				: (await cachedArticle(payload, segment)) !== null
	}
	if (answer === true) memory.retenir(key)
	return answer
}
