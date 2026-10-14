import type { CollectionConfig } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { galerieDImages, IMAGES_SEULEMENT } from '../lib/articles'
import {
	ACCES_REDACTION,
	champPublieLe,
	champSlug,
	champStrapiId,
	datePremierePublication,
	VERSIONS_REDACTION,
} from './redaction'

/**
 * The articles of the blog, `/blog/<slug>` (plan 01 §6.1; docs/migration/SCHEMA.md, §5.3).
 *
 * - The rules of the talents (`./redaction`): written by the newsroom (`admin` and `redaction`),
 *   which creates, publishes, unpublishes and deletes; everyone else reads the published articles
 *   only, drafts and versions closed.
 * - The fields keep their names from the old site, but `galery`, a typo, becomes `galerie`. Each
 *   article keeps its slug: the import copies it as it is, so the addresses of today stay the same.
 * - `content` is markdown, in a `code` field, without a length limit: Payload limits `text` and
 *   `textarea` to 40 000 characters.
 * - The gallery holds images only, never a PDF (`galerieDImages`), drafts included. Its photos
 *   belong to nobody: the newsroom sends them, and the public reads one when it is in the gallery
 *   of a published article (`lectureDesMedias`, src/lib/acces.ts).
 */
export const Articles: CollectionConfig<'articles'> = {
	slug: 'articles',
	labels: { singular: 'Article', plural: 'Articles' },
	admin: { useAsTitle: 'title', defaultColumns: ['title', 'slug', '_status', 'updatedAt'] },
	access: ACCES_REDACTION,
	versions: VERSIONS_REDACTION,
	hooks: { beforeChange: [datePremierePublication] },
	fields: [
		{ name: 'title', label: 'Titre', type: 'text', required: true },
		champSlug('/blog'),
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
			name: 'galerie',
			label: 'Galerie',
			type: 'upload',
			relationTo: 'media',
			hasMany: true,
			filterOptions: IMAGES_SEULEMENT,
			hooks: { beforeChange: [galerieDImages] },
			admin: { description: 'Des images seulement : JPEG, PNG, WebP, GIF ou AVIF.' },
		},
		champPublieLe,
		champStrapiId,
	],
}
