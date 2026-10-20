/**
 * Does the page of this address exist? Asked by the proxy before the page runs (ticket 231). The reads are
 * those of the pages (src/services/public/en-cache.ts); what exists is remembered for a minute by the process
 * (`memoireDesPagesQuiExistent`), because Next's cache keeps nothing from the proxy. An unknown address is read
 * at each visit, as the pages read it.
 */

import config from '@payload-config'
import { getPayload } from 'payload'
import { type FamilleVerifiee, memoireDesPagesQuiExistent } from '@/lib/urls/page-inconnue'
import { lAdresseDeProfilEnCache, lArticleEnCache, leTalentEnCache } from './cached'

const memoire = memoireDesPagesQuiExistent()

/** False only for an address the page would answer with its 404; a redirection of a profile is a page. */
export async function existeUnePage(famille: FamilleVerifiee, segment: string): Promise<boolean> {
	const cle = `${famille}:${segment}`
	if (memoire.connait(cle)) return true
	const payload = await getPayload({ config })
	const existe =
		famille === 'profil'
			? (await lAdresseDeProfilEnCache(payload, segment)).type !== 'inconnue'
			: famille === 'talent'
				? (await leTalentEnCache(payload, segment)) !== null
				: (await lArticleEnCache(payload, segment)) !== null
	if (existe) memoire.retenir(cle)
	return existe
}
