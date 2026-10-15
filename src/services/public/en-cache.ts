/**
 * The public reads that a page keeps in Next's cache (tickets 097 and 098): the build runs without a
 * database, so a page renders on its first request and reads these. Each one carries the tag of the
 * list it reads (`ETIQUETTES`, src/lib/revalidation.ts): a save of a profile or of a talent refreshes
 * it (src/collections/revalidation.ts), and the import refreshes nothing. The time is only a net: a
 * change made outside of a request of Next (a script) is seen within the hour.
 *
 * The rest of the cache work, the pages themselves, is ticket 117.
 */

import config from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'
import { ETIQUETTES } from '@/lib/revalidation'
import { listerLesArticles } from './liste-articles'
import { lireLesPagesIndexables } from './pages-indexables'
import { lireLAnnuaire } from './profils'
import { listerLesTalents } from './talents'

const UNE_HEURE = 60 * 60

/** The talents of the home page. */
export const lesTalentsEnCache = unstable_cache(
	async () => listerLesTalents(await getPayload({ config })),
	['public:talents'],
	{ tags: [ETIQUETTES.talents], revalidate: UNE_HEURE }
)

/** Every listed profile, with her place: what the search by city ranks. */
export const lAnnuaireEnCache = unstable_cache(
	async () => lireLAnnuaire(await getPayload({ config })),
	['public:annuaire'],
	{ tags: [ETIQUETTES.profils], revalidate: UNE_HEURE }
)

/**
 * The same directory with the texts a search by a word looks into (ticket 099). Kept apart from the one
 * above, which the search by city and the pages without a word read: it is heavier, and read only when a
 * word was typed. The word itself is never part of the key: the directory is cached, the search is made
 * on it in memory.
 */
export const lAnnuaireAvecLesTextesEnCache = unstable_cache(
	async () => lireLAnnuaire(await getPayload({ config }), { avecLesTextes: true }),
	['public:annuaire-textes'],
	{ tags: [ETIQUETTES.profils], revalidate: UNE_HEURE }
)

/** The articles of the blog list (ticket 107): refreshed by a save of an article. */
export const lesArticlesEnCache = unstable_cache(
	async () => listerLesArticles(await getPayload({ config })),
	['public:articles'],
	{ tags: [ETIQUETTES.articles], revalidate: UNE_HEURE }
)

/**
 * The profiles, talents and articles the sitemap and the plan of the site list (tickets 113 and 114): one
 * reading for both, refreshed by a save of any of the three collections. An error is not cached.
 */
export const lesPagesIndexablesEnCache = unstable_cache(
	async () => lireLesPagesIndexables(await getPayload({ config })),
	['public:pages-indexables'],
	{ tags: [ETIQUETTES.profils, ETIQUETTES.talents, ETIQUETTES.articles], revalidate: UNE_HEURE }
)
