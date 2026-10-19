/**
 * The articles of the blog, `/blog/<slug>` (docs/migration/SCHEMA.md, §5.3; ticket 061): taken as
 * they are, drafts included.
 *
 * - Every field as it is, byte for byte: the markdown stays markdown, the slug stays the slug, so
 *   that the addresses of today stay the same. `galery`, a typo of Strapi, becomes `gallery`.
 * - Published when the source has a publication date, with that date; a draft otherwise (§7).
 * - A slug that does not already have the form of an address, or that two articles share, is
 *   refused before any write and listed (rule 5), as for the talents: it is never corrected.
 * - An image of the gallery is attached when its file is adopted (./medias.ts): a media of the
 *   newsroom, without an owner. A file not adopted (a PDF, a video) is reported, never invented.
 *
 * No `bun` import here: the import can run under Node too.
 */

import { type LienDeFichier, type PhotoNonReprise, photosDeLEntree, TYPE_ARTICLE } from './medias'
import type { Adaptateur, Attendu, Refus } from './moteur'
import { iso, type Requete } from './source'
import { repartirParSlug } from './talents'

/** A row of `articles`, as the import reads it. */
export interface LigneArticle {
	id: number
	title: string | null
	content: string | null
	author: string | null
	seo_title: string | null
	seo_description: string | null
	slug: string | null
	excerpt: string | null
	created_at: string
	updated_at: string
	published_at: string | null
}

const LECTURE_DES_ARTICLES = `SELECT id, title, content, author, seo_title, seo_description, slug, excerpt,
	${iso('created_at')} AS created_at, ${iso('updated_at')} AS updated_at, ${iso('published_at')} AS published_at
	FROM articles ORDER BY id`

export const lireLesArticles = (requete: Requete): Promise<LigneArticle[]> =>
	requete<LigneArticle>(LECTURE_DES_ARTICLES)

export const ADAPTATEUR_ARTICLES: Adaptateur = {
	collection: 'articles',
	champs: {
		title: 'texte',
		slug: 'texte',
		author: 'texte',
		excerpt: 'texte',
		seo_title: 'texte',
		seo_description: 'texte',
		content: 'texte',
		gallery: 'relations',
		_status: 'texte',
		publishedAt: 'date',
		createdAt: 'date',
		updatedAt: 'date',
	},
	options: attendu => ({ brouillon: attendu.valeurs._status === 'draft' }),
}

/** The articles of the source split in two by their slug, as the talents are (`repartirParSlug`). */
export const articlesRepartis = (lignes: readonly LigneArticle[]): { pris: LigneArticle[]; refuses: Refus[] } =>
	repartirParSlug(lignes)

/**
 * The articles the target must hold, with the images of their gallery. `liens` are the links of
 * the files of the source, in order; `medias` gives, for each file adopted, its identifier in
 * Payload, or `null` while it is still to be created (a dry run).
 */
export function articlesAttendus(
	pris: readonly LigneArticle[],
	liens: readonly LienDeFichier[],
	medias: ReadonlyMap<number, number | null> = new Map()
): { attendus: Attendu[]; photosNonReprises: PhotoNonReprise[] } {
	const photosNonReprises: PhotoNonReprise[] = []
	const attendus = pris.map((ligne): Attendu => {
		const fichiers = liens
			.filter(({ type, champ, entree }) => type === TYPE_ARTICLE && champ === 'galery' && entree === ligne.id)
			.map(({ fichier }) => fichier)
		const galerie = photosDeLEntree(fichiers, medias)
		for (const fichier of galerie.nonReprises) photosNonReprises.push({ entree: ligne.id, fichier })
		return {
			strapiId: ligne.id,
			valeurs: {
				strapiId: ligne.id,
				title: ligne.title,
				slug: ligne.slug,
				author: ligne.author,
				excerpt: ligne.excerpt,
				seo_title: ligne.seo_title,
				seo_description: ligne.seo_description,
				content: ligne.content,
				gallery: galerie.ids,
				_status: ligne.published_at === null ? 'draft' : 'published',
				publishedAt: ligne.published_at,
				createdAt: ligne.created_at,
				updatedAt: ligne.updated_at,
			},
			ecarts: [],
		}
	})
	return { attendus, photosNonReprises }
}
