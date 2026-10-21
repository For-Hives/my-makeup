import type { Metadata } from 'next'
import { type ShareImage, type ShareType, shareTags } from './share'
import { descriptionMeta, editorialDescription, pageTitle } from './text'
import { canonicalUrl } from './url'

export interface PageInputs {
	/** The title of the page, without the brand: the helper adds it when it fits. */
	titre: unknown
	/** False keeps the title as written, without « | My-Makeup » (the old site's title of a few fixed pages). */
	marque?: boolean
	/** Candidate texts in order of preference. */
	description: unknown
	/** Used when no candidate has 70 characters. */
	repli: string
	/** The path of the page, never its query. */
	chemin: string
	/** False for a page that must not be indexed: it then has no canonical address. */
	indexable?: boolean
	/** `og:type`: « website » unless the page is a profile or an article. */
	typeDePartage?: ShareType
	/** The picture of the shared link; the picture of the site when the page has none (ticket 116). */
	image?: ShareImage
}

/** The metadata of a page once its description is known. A page that is not indexed keeps its share tags. */
function assembler(
	{ titre, chemin, indexable = true, typeDePartage, image, marque }: PageInputs,
	description: string
): Metadata {
	const fullTitle = pageTitle(titre, { marque })
	return {
		title: { absolute: fullTitle },
		description,
		...(indexable ? { alternates: { canonical: canonicalUrl(chemin) } } : { robots: { index: false, follow: true } }),
		...shareTags({ titre: fullTitle, description, url: canonicalUrl(chemin), type: typeDePartage, image }),
	}
}

/**
 * What every page gets by default: title, description, canonical address, robots, and the tags of a shared
 * link (Open Graph and Twitter card).
 */
export function pageMetadata(entrees: PageInputs): Metadata {
	return assembler(entrees, descriptionMeta(entrees.description, entrees.repli))
}

/** The not-found pages: titled, no canonical. Next adds their noindex tag by itself. */
export const notFoundMetadata = (titre: string): Metadata => ({ title: { absolute: pageTitle(titre) } })

/**
 * The metadata of a page the newsroom writes (a talent, an article): the defaults, with the description
 * of `editorialDescription` (the newsroom's own text kept as it is).
 */
export function editorialMetadata({
	descriptionRedigee,
	autres,
	...entrees
}: Omit<PageInputs, 'description'> & { descriptionRedigee: unknown; autres: readonly unknown[] }): Metadata {
	return assembler({ ...entrees, description: [] }, editorialDescription(descriptionRedigee, autres, entrees.repli))
}
