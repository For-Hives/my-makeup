/**
 * The public reads that a page keeps in Next's cache (tickets 097 and 098): the build runs without a
 * database, so a page renders on its first request and reads these. Each one carries the tag of the
 * list it reads (`ETIQUETTES`, src/lib/revalidation.ts): a save of a profile or of a talent refreshes
 * it (src/collections/revalidation.ts), and the import refreshes nothing. The time is only a net: a
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
import { valeursARechercher } from '@/lib/profil/adresse'
import { ETIQUETTES } from '@/lib/revalidation'
import { estUnSlug } from '@/lib/slug'
import { type ArticlePublic, lireUnArticlePublic } from './articles'
import { listerLesArticles } from './liste-articles'
import { lireLesPagesIndexables } from './pages-indexables'
import { type AdresseDeProfil, lireLAdresseDeProfil, lireLAnnuaire } from './profils'
import { lireLeTalent, listerLesTalents, type TalentDeLaPage } from './talents'

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

/** What a read of one page gives: the document to keep, or what to answer without keeping anything. */
type Lecture<T, E> = { garder: T } | { ecart: E }

/** Thrown to leave the cache without writing: `unstable_cache` keeps a value, never a failure. */
class PasGardee extends Error {}

/**
 * Keeps the document of one page in Next's cache under its tag, and only when the read finds it. When it
 * does not (`ecart`), the answer of that read is given back and nothing is written.
 */
async function enCacheSiTrouve<T, E>(
	cle: string[],
	etiquette: string,
	lire: () => Promise<Lecture<T, E>>
): Promise<{ garder: T } | { ecart: E }> {
	let ecart: { ecart: E } | undefined
	const lue = unstable_cache(
		async () => {
			const lecture = await lire()
			if ('garder' in lecture) return lecture.garder
			ecart = lecture
			throw new PasGardee()
		},
		cle,
		{ tags: [etiquette], revalidate: UNE_HEURE }
	)
	try {
		return { garder: await lue() }
	} catch (erreur) {
		if (ecart) return ecart
		throw erreur
	}
}

/**
 * What the address `/profil/<segment>` leads to. A published profile read at its own slug is kept under
 * `profil:<slug>`; everything else (a variant, an old username, a draft, an unknown or hidden profile) is
 * read at each visit, as before.
 */
export async function lAdresseDeProfilEnCache(payload: Payload, segment: string): Promise<AdresseDeProfil> {
	const slug = valeursARechercher(segment)?.segment
	if (slug === undefined || !estUnSlug(slug)) return lireLAdresseDeProfil(payload, segment)
	const lecture = await enCacheSiTrouve<AdresseDeProfil & { type: 'profil' }, AdresseDeProfil>(
		['public:profil', slug],
		ETIQUETTES.profil(slug),
		async () => {
			const adresse = await lireLAdresseDeProfil(payload, slug)
			return adresse.type === 'profil' && adresse.publie && adresse.profil.slug === slug
				? { garder: adresse }
				: { ecart: adresse }
		}
	)
	return 'garder' in lecture ? lecture.garder : lecture.ecart
}

/** The published talent of this slug, kept under `talent:<slug>`; `null` (unknown, a draft) is not kept. */
export async function leTalentEnCache(payload: Payload, slug: string): Promise<TalentDeLaPage | null> {
	if (!estUnSlug(slug)) return null
	const lecture = await enCacheSiTrouve<TalentDeLaPage, null>(
		['public:talent', slug],
		ETIQUETTES.talent(slug),
		async () => {
			const talent = await lireLeTalent(payload, slug)
			return talent ? { garder: talent } : { ecart: null }
		}
	)
	return 'garder' in lecture ? lecture.garder : null
}

/** The published article of this slug, kept under `article:<slug>`; `null` (unknown, a draft) is not kept. */
export async function lArticleEnCache(payload: Payload, slug: string): Promise<ArticlePublic | null> {
	if (!estUnSlug(slug)) return null
	const lecture = await enCacheSiTrouve<ArticlePublic, null>(
		['public:article', slug],
		ETIQUETTES.article(slug),
		async () => {
			const article = await lireUnArticlePublic(payload, slug)
			return article ? { garder: article } : { ecart: null }
		}
	)
	return 'garder' in lecture ? lecture.garder : null
}
