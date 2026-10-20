/**
 * The articles of the blog, `/blog/<slug>` (docs/migration/SCHEMA.md, §5.3; ticket 061): taken as
 * they are, drafts included.
 *
 * - Every field as it is, byte for byte: the markdown stays markdown, the slug stays the slug, so
 *   that the addresses of today stay the same. `galery`, a typo of Strapi, becomes `gallery`.
 * - Published when the source has a publication date, with that date; a draft otherwise (§7).
 * - A slug that does not already have the form of an address, or that two articles share, is
 *   refused before any write and listed (rule 5), as for the talents: it is never corrected.
 * - An image of the gallery is attached when its file is adopted (./media.ts): a media of the
 *   newsroom, without an owner. A file not adopted (a PDF, a video) is reported, never invented.
 *
 * No `bun` import here: the import can run under Node too.
 */

import type { Adapter, Expected, Refusal } from './engine'
import { entryPhotos, type FileLink, type PhotoNotCarriedOver, TYPE_ARTICLE } from './media'
import { iso, type Query } from './source'
import { splitBySlug } from './talents'

/** A row of `articles`, as the import reads it. */
export interface ArticleRow {
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

const ARTICLES_QUERY = `SELECT id, title, content, author, seo_title, seo_description, slug, excerpt,
	${iso('created_at')} AS created_at, ${iso('updated_at')} AS updated_at, ${iso('published_at')} AS published_at
	FROM articles ORDER BY id`

export const readArticles = (requete: Query): Promise<ArticleRow[]> => requete<ArticleRow>(ARTICLES_QUERY)

export const ARTICLES_ADAPTER: Adapter = {
	collection: 'articles',
	fields: {
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
	options: attendu => ({ draft: attendu.values._status === 'draft' }),
}

/** The articles of the source split in two by their slug, as the talents are (`repartirParSlug`). */
export const splitArticles = (lignes: readonly ArticleRow[]): { taken: ArticleRow[]; refused: Refusal[] } =>
	splitBySlug(lignes)

/**
 * The articles the target must hold, with the images of their gallery. `liens` are the links of
 * the files of the source, in order; `medias` gives, for each file adopted, its identifier in
 * Payload, or `null` while it is still to be created (a dry run).
 */
export function expectedArticles(
	pris: readonly ArticleRow[],
	liens: readonly FileLink[],
	medias: ReadonlyMap<number, number | null> = new Map()
): { expected: Expected[]; photosNotCarriedOver: PhotoNotCarriedOver[] } {
	const photosNotCarriedOver: PhotoNotCarriedOver[] = []
	const expected = pris.map((ligne): Expected => {
		const files = liens
			.filter(({ type, champ, entree }) => type === TYPE_ARTICLE && champ === 'galery' && entree === ligne.id)
			.map(({ fichier: file }) => file)
		const gallery = entryPhotos(files, medias)
		for (const file of gallery.nonReprises) photosNotCarriedOver.push({ entry: ligne.id, file: file })
		return {
			strapiId: ligne.id,
			values: {
				strapiId: ligne.id,
				title: ligne.title,
				slug: ligne.slug,
				author: ligne.author,
				excerpt: ligne.excerpt,
				seo_title: ligne.seo_title,
				seo_description: ligne.seo_description,
				content: ligne.content,
				gallery: gallery.ids,
				_status: ligne.published_at === null ? 'draft' : 'published',
				publishedAt: ligne.published_at,
				createdAt: ligne.created_at,
				updatedAt: ligne.updated_at,
			},
			gaps: [],
		}
	})
	return { expected, photosNotCarriedOver }
}
