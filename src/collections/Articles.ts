import type { CollectionConfig } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { editorialImages, imageGallery } from '../lib/articles'
import {
	EDITOR_ACCESS,
	EDITOR_VERSIONS,
	firstPublicationDate,
	publishedAtFieldDef,
	slugFieldDef,
	strapiIdFieldDef,
} from './editor'
import { refresh } from './revalidate'

/** The refresh of its page, of the pages that list the articles and of the sitemap (ticket 047). */
const REFRESH = refresh('articles')

/**
 * The articles of the blog, `/blog/<slug>` (plan 01 §6.1; docs/migration/SCHEMA.md, §5.3).
 *
 * - The rules of the talents (`./editor`): written by the newsroom (`admin` and `editor`),
 *   which creates, publishes, unpublishes and deletes; everyone else reads the published articles
 *   only, drafts and versions closed.
 * - The fields keep their names from the old site, but `galery`, a typo, becomes `gallery`. Each
 *   article keeps its slug: the import copies it as it is, so the addresses of today stay the same.
 * - `content` is markdown, in a `code` field, without a length limit: Payload limits `text` and
 *   `textarea` to 40 000 characters.
 * - The gallery holds images of the newsroom only, never a PDF nor the photo of a makeup artist
 *   (`imageGallery`), drafts and the import included. Its photos belong to nobody: the newsroom
 *   sends them, and the public reads one when it is in the gallery of a published article
 *   (`mediaRead`, src/lib/access.ts).
 * - A save or a deletion of an article that is or was published refreshes its page, the blog and
 *   the sitemap; the import refreshes nothing (src/collections/revalidate.ts, ticket 047).
 */
export const Articles: CollectionConfig<'articles'> = {
	slug: 'articles',
	labels: { singular: 'Article', plural: 'Articles' },
	admin: { useAsTitle: 'title', defaultColumns: ['title', 'slug', '_status', 'updatedAt'] },
	access: EDITOR_ACCESS,
	versions: EDITOR_VERSIONS,
	hooks: {
		beforeChange: [REFRESH.avantEcriture, firstPublicationDate],
		afterChange: [REFRESH.apresEcriture],
		beforeDelete: [REFRESH.avantSuppression],
		afterDelete: [REFRESH.apresSuppression],
	},
	fields: [
		{ name: 'title', label: 'Titre', type: 'text', required: true },
		slugFieldDef('/blog'),
		{ name: 'author', label: 'Auteur', type: 'text', admin: { description: 'Signature affichée sous le titre.' } },
		{ name: 'excerpt', label: 'Extrait', type: 'textarea' },
		{ name: 'seo_title', label: 'Titre pour les moteurs de recherche', type: 'text', maxLength: 70 },
		{
			name: 'seo_description',
			label: 'Description pour les moteurs de recherche',
			type: 'textarea',
			maxLength: 155,
		},
		{
			name: 'content',
			label: 'Contenu',
			type: 'code',
			admin: { language: 'markdown', description: 'En markdown.' },
		},
		{
			name: 'gallery',
			label: 'Galerie',
			type: 'upload',
			relationTo: 'media',
			hasMany: true,
			filterOptions: editorialImages,
			hooks: { beforeChange: [imageGallery] },
			admin: {
				description: 'Des images de la rédaction, jamais la photo d’une maquilleuse : JPEG, PNG, WebP, GIF ou AVIF.',
			},
		},
		publishedAtFieldDef,
		strapiIdFieldDef,
	],
}
