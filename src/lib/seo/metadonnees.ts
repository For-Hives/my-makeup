import type { Metadata } from 'next'
import { descriptionMeta, titrePage } from './texte'
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
}

/** What every page gets by default: title, description, canonical address and robots. */
export function metadonnees({ titre, description, repli, chemin, indexable = true }: EntreesDePage): Metadata {
	return {
		title: { absolute: titrePage(titre) },
		description: descriptionMeta(description, repli),
		...(indexable ? { alternates: { canonical: urlCanonique(chemin) } } : { robots: { index: false, follow: true } }),
	}
}

/** The not-found pages: titled, no canonical. Next adds their noindex tag by itself. */
export const metadonneesIntrouvable = (titre: string): Metadata => ({ title: { absolute: titrePage(titre) } })
