import type { Metadata } from 'next'
import { balisesDePartage, type ImageDePartage, type TypeDePartage } from './partage'
import { descriptionEditoriale, descriptionMeta, titrePage } from './texte'
import { urlCanonique } from './url'

export interface EntreesDePage {
	/** The title of the page, without the brand: the helper adds it when it fits. */
	titre: unknown
	/** Candidate texts in order of preference. */
	description: unknown
	/** Used when no candidate has 70 characters. */
	repli: string
	/** The path of the page, never its query. */
	chemin: string
	/** False for a page that must not be indexed: it then has no canonical address. */
	indexable?: boolean
	/** `og:type`: « website » unless the page is a profile or an article. */
	typeDePartage?: TypeDePartage
	/** The picture of the shared link; the picture of the site when the page has none (ticket 116). */
	image?: ImageDePartage
}

/** The metadata of a page once its description is known. A page that is not indexed keeps its share tags. */
function assembler(
	{ titre, chemin, indexable = true, typeDePartage, image }: EntreesDePage,
	description: string
): Metadata {
	const titreComplet = titrePage(titre)
	return {
		title: { absolute: titreComplet },
		description,
		...(indexable ? { alternates: { canonical: urlCanonique(chemin) } } : { robots: { index: false, follow: true } }),
		...balisesDePartage({ titre: titreComplet, description, url: urlCanonique(chemin), type: typeDePartage, image }),
	}
}

/**
 * What every page gets by default: title, description, canonical address, robots, and the tags of a shared
 * link (Open Graph and Twitter card).
 */
export function metadonnees(entrees: EntreesDePage): Metadata {
	return assembler(entrees, descriptionMeta(entrees.description, entrees.repli))
}

/** The not-found pages: titled, no canonical. Next adds their noindex tag by itself. */
export const metadonneesIntrouvable = (titre: string): Metadata => ({ title: { absolute: titrePage(titre) } })

/**
 * The metadata of a page the newsroom writes (a talent, an article): the defaults, with the description
 * of `descriptionEditoriale` (the newsroom's own text kept as it is).
 */
export function metadonneesEditoriales({
	descriptionRedigee,
	autres,
	...entrees
}: Omit<EntreesDePage, 'description'> & { descriptionRedigee: unknown; autres: readonly unknown[] }): Metadata {
	return assembler({ ...entrees, description: [] }, descriptionEditoriale(descriptionRedigee, autres, entrees.repli))
}
