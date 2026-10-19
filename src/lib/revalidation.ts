/**
 * Which cached pages a change of a public document makes stale (ticket 047): the page of the
 * document, and the pages that list the documents of its collection, the sitemap among them.
 *
 * The public pages are rendered by the server and kept in Next's cache; a save tells Next which of
 * them to render again (src/collections/revalidation.ts). Each one is named twice:
 * - by its path (`revalidatePath`): `/profil/<slug>`, `/search`, `/sitemap.xml`…;
 * - by a tag (`revalidateTag`), which a cached read of the data carries (`ETIQUETTES`): every page
 *   that reads a profile, a talent or an article is then refreshed, whichever page it is.
 *
 * Nothing is refreshed when the document is public neither before nor after the save: a draft that
 * stays a draft, a hidden profile that stays hidden.
 *
 * No `next` import: the rule is pure, and tested without Next.
 */

import { estUnSlug } from './slug'

/** The collections whose documents have a public page. */
export type ContenuPublic = 'profiles' | 'articles' | 'talents'

/** What the public sees of a document, read from its stored row. */
export interface EtatPublic {
	/** The end of the address of its page. */
	slug: string
	/** Shown to the public: a published profile (`status`), a published article or talent (`_status`). */
	visible: boolean
	/**
	 * In the sitemap: a profile is there when it is publishable, a published article or talent always.
	 * Left out, it is `visible`. Read by IndexNow only (src/lib/seo/indexnow.ts, ticket 219).
	 */
	indexable?: boolean
}

/**
 * The tags a cached read of public data carries, so that a save refreshes it: the tag of the list
 * of its collection for a read of several documents (the search, the sitemap, the plan of the
 * site, the home page), and the tag of the document for a read of one.
 */
export const ETIQUETTES = {
	profils: 'profils',
	profil: (slug: string) => `profil:${slug}`,
	articles: 'articles',
	article: (slug: string) => `article:${slug}`,
	talents: 'talents',
	talent: (slug: string) => `talent:${slug}`,
} as const

/** The pages of the site that show the documents of a collection. */
interface PagesDuContenu {
	/** The page of one document. */
	page: (slug: string) => string
	/** The tag of the read of one document. */
	etiquette: (slug: string) => string
	/** The tag of the reads of several documents. */
	etiquetteDeLaListe: string
	/** The pages that list the documents of the collection. */
	listes: readonly string[]
}

/** The two lists every public document is in: the plan of the site and the sitemap. */
const PLANS = ['/site-map', '/sitemap.xml'] as const

/**
 * Where each collection is shown. A profile is listed by the search, the plan of the site and the
 * sitemap; an article by the blog; a talent by the home page. The search lists profiles only.
 */
export const PAGES_PUBLIQUES: Readonly<Record<ContenuPublic, PagesDuContenu>> = {
	profiles: {
		page: slug => `/profil/${slug}`,
		etiquette: ETIQUETTES.profil,
		etiquetteDeLaListe: ETIQUETTES.profils,
		listes: ['/search', ...PLANS],
	},
	articles: {
		page: slug => `/blog/${slug}`,
		etiquette: ETIQUETTES.article,
		etiquetteDeLaListe: ETIQUETTES.articles,
		listes: ['/blog', ...PLANS],
	},
	talents: {
		page: slug => `/talent/${slug}`,
		etiquette: ETIQUETTES.talent,
		etiquetteDeLaListe: ETIQUETTES.talents,
		listes: ['/', ...PLANS],
	},
}

/** What a save makes stale: paths for `revalidatePath`, tags for `revalidateTag`. */
export interface Cibles {
	chemins: string[]
	etiquettes: string[]
}

/**
 * The pages a save makes stale, from the stored row of the document before and after it: `null`
 * when there is none (before a creation, after a deletion).
 *
 * - Public neither before nor after: nothing.
 * - Otherwise: the page of each public version, the old address and the new one when the slug
 *   changed, and the pages that list the collection, which gain, lose or change a document. A
 *   draft version saved over a published article refreshes it too: nothing tells it from a change
 *   of the published one, and a page rendered again for nothing costs one render.
 *
 * A slug that is not a real one (the provisional slug of a profile being created) gives no page.
 */
export function ciblesDuChangement(contenu: ContenuPublic, avant: EtatPublic | null, apres: EtatPublic | null): Cibles {
	const publics = [avant, apres].filter((etat): etat is EtatPublic => etat?.visible === true)
	if (publics.length === 0) return { chemins: [], etiquettes: [] }
	const pages = PAGES_PUBLIQUES[contenu]
	const slugs = [...new Set(publics.map(({ slug }) => slug))].filter(estUnSlug)
	return {
		chemins: [...slugs.map(pages.page), ...pages.listes],
		etiquettes: [...slugs.map(pages.etiquette), pages.etiquetteDeLaListe],
	}
}
