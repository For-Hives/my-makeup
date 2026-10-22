/**
 * The public reads that a page keeps in Next's cache (tickets 097 and 098): the build runs without a
 * database, so a page renders on its first request and reads these. Each one carries the tag of the
 * list it reads (`TAGS`, src/lib/revalidate.ts): a save of a profile or of a talent refreshes
 * it (src/collections/revalidate.ts), and the import refreshes nothing. The time is only a net: a
 * change made outside of a request of Next (a script) is seen within the hour.
 *
 * Ticket 117 adds the reads of one page: a profile, a talent, an article. Each is kept under the tag of
 * its document (`profil:<slug>`…), so that a save refreshes that page alone and a second visit of an
 * unchanged page asks the database nothing. Only a document the public sees is kept: an unknown address,
 * a draft, a hidden profile, a redirection are read again at each visit (an address anybody can invent
 * must not fill the cache), and the 404 of a document that appears is never stale.
 */

import config from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload, type Payload } from 'payload'
import { valuesToSearch } from '@/lib/profile/url'
import { TAGS } from '@/lib/revalidate'
import { isSlug } from '@/lib/slug'
import { listArticles } from './article-list'
import { type ArticlePublic, readPublicArticle } from './articles'
import { readIndexablePages } from './indexable-pages'
import { profileBlockCards } from './profile-block'
import { type ProfileUrlTarget, readDirectory, readProfileUrlTarget } from './profiles'
import { listTalents, readTalent, type TalentPageData } from './talents'

const ONE_HOUR = 60 * 60

/** The talents of the home page. */
export const cachedTalents = unstable_cache(async () => listTalents(await getPayload({ config })), ['public:talents'], {
	tags: [TAGS.talents],
	revalidate: ONE_HOUR,
})

/** Every listed profile, with her place: what the search by city ranks. */
export const cachedDirectory = unstable_cache(
	async () => readDirectory(await getPayload({ config })),
	['public:annuaire'],
	{ tags: [TAGS.profils], revalidate: ONE_HOUR }
)

/**
 * The same directory with the texts a search by a word looks into (ticket 099). Kept apart from the one
 * above, which the search by city and the pages without a word read: it is heavier, and read only when a
 * word was typed. The word itself is never part of the key: the directory is cached, the search is made
 * on it in memory.
 */
export const cachedDirectoryWithTexts = unstable_cache(
	async () => readDirectory(await getPayload({ config }), { avecLesTextes: true }),
	['public:annuaire-textes'],
	{ tags: [TAGS.profils], revalidate: ONE_HOUR }
)

/**
 * The block of makeup artists under a page of text (ticket 305): the cards for a search word (the title of
 * a talent) or, for an empty word, the first ones of the directory. Kept under the tag of the profiles: the
 * publication, the change or the hiding of a profile refreshes the pages that show it. The word and the
 * size are the key of the entry.
 */
export const cachedProfileBlock = unstable_cache(
	async (search: string, limit: number) =>
		profileBlockCards(search === '' ? await cachedDirectory() : await cachedDirectoryWithTexts(), { search, limit }),
	['public:profile-block'],
	{ tags: [TAGS.profils], revalidate: ONE_HOUR }
)

/** The articles of the blog list (ticket 107): refreshed by a save of an article. */
export const cachedArticles = unstable_cache(
	async () => listArticles(await getPayload({ config })),
	['public:articles'],
	{ tags: [TAGS.articles], revalidate: ONE_HOUR }
)

/**
 * The profiles, talents and articles the sitemap and the plan of the site list (tickets 113 and 114): one
 * reading for both, refreshed by a save of any of the three collections. An error is not cached.
 */
export const cachedIndexablePages = unstable_cache(
	async () => readIndexablePages(await getPayload({ config })),
	['public:pages-indexables'],
	{ tags: [TAGS.profils, TAGS.talents, TAGS.articles], revalidate: ONE_HOUR }
)

/** What a read of one page gives: the document to keep, or what to answer without keeping anything. */
type ReadOutcome<T, E> = { garder: T } | { ecart: E }

/** Thrown to leave the cache without writing: `unstable_cache` keeps a value, never a failure. */
class NotKept extends Error {}

/**
 * Keeps the document of one page in Next's cache under its tag, and only when the read finds it. When it
 * does not (`ecart`), the answer of that read is given back and nothing is written.
 */
async function cachedIfFound<T, E>(
	cle: string[],
	etiquette: string,
	lire: () => Promise<ReadOutcome<T, E>>
): Promise<{ garder: T } | { ecart: E }> {
	let gap: { ecart: E } | undefined
	const read = unstable_cache(
		async () => {
			const reading = await lire()
			if ('garder' in reading) return reading.garder
			gap = reading
			throw new NotKept()
		},
		cle,
		{ tags: [etiquette], revalidate: ONE_HOUR }
	)
	try {
		return { garder: await read() }
	} catch (error) {
		if (gap) return gap
		throw error
	}
}

/**
 * What the address `/profil/<segment>` leads to. A published profile read at its own slug is kept under
 * `profil:<slug>`; everything else (a variant, an old username, a draft, an unknown or hidden profile) is
 * read at each visit, as before.
 */
export async function cachedProfileUrl(payload: Payload, segment: string): Promise<ProfileUrlTarget> {
	const slug = valuesToSearch(segment)?.segment
	if (slug === undefined || !isSlug(slug)) return readProfileUrlTarget(payload, segment)
	const reading = await cachedIfFound<ProfileUrlTarget & { type: 'profil' }, ProfileUrlTarget>(
		['public:profil', slug],
		TAGS.profil(slug),
		async () => {
			const target = await readProfileUrlTarget(payload, slug)
			return target.type === 'profil' && target.publie && target.profil.slug === slug
				? { garder: target }
				: { ecart: target }
		}
	)
	return 'garder' in reading ? reading.garder : reading.ecart
}

/** The published talent of this slug, kept under `talent:<slug>`; `null` (unknown, a draft) is not kept. */
export async function cachedTalent(payload: Payload, slug: string): Promise<TalentPageData | null> {
	if (!isSlug(slug)) return null
	const reading = await cachedIfFound<TalentPageData, null>(['public:talent', slug], TAGS.talent(slug), async () => {
		const talent = await readTalent(payload, slug)
		return talent ? { garder: talent } : { ecart: null }
	})
	return 'garder' in reading ? reading.garder : null
}

/** The published article of this slug, kept under `article:<slug>`; `null` (unknown, a draft) is not kept. */
export async function cachedArticle(payload: Payload, slug: string): Promise<ArticlePublic | null> {
	if (!isSlug(slug)) return null
	const reading = await cachedIfFound<ArticlePublic, null>(['public:article', slug], TAGS.article(slug), async () => {
		const article = await readPublicArticle(payload, slug)
		return article ? { garder: article } : { ecart: null }
	})
	return 'garder' in reading ? reading.garder : null
}
