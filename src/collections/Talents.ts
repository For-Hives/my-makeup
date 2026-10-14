import type { CollectionConfig } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import {
	ACCES_REDACTION,
	champPublieLe,
	champSlug,
	champStrapiId,
	datePremierePublication,
	VERSIONS_REDACTION,
} from './redaction'
import { rafraichissement } from './revalidation'

/** The refresh of its page, of the pages that list the talents and of the sitemap (ticket 047). */
const RAFRAICHISSEMENT = rafraichissement('talents')

/**
 * The pages of a speciality, `/talent/<slug>` (plan 01 §6.1; docs/migration/SCHEMA.md, §5.4).
 *
 * - Written by the newsroom (`admin` and `redaction`), which creates, publishes, unpublishes and
 *   deletes; everyone else reads the published talents only (`./redaction`).
 * - The fields keep their names from the old site. Each talent keeps its slug: the import copies
 *   it as it is, so the 14 addresses of today stay the same, and two talents never share one.
 * - `content` is markdown, in a `code` field: Payload limits `text` and `textarea` to 40 000
 *   characters.
 * - A save or a deletion of a talent that is or was published refreshes its page, the home page
 *   and the sitemap; the import refreshes nothing (src/collections/revalidation.ts, ticket 047).
 */
export const Talents: CollectionConfig<'talents'> = {
	slug: 'talents',
	labels: { singular: 'Talent', plural: 'Talents' },
	admin: { useAsTitle: 'title', defaultColumns: ['title', 'slug', '_status', 'updatedAt'] },
	access: ACCES_REDACTION,
	versions: VERSIONS_REDACTION,
	hooks: {
		beforeChange: [RAFRAICHISSEMENT.avantEcriture, datePremierePublication],
		afterChange: [RAFRAICHISSEMENT.apresEcriture],
		beforeDelete: [RAFRAICHISSEMENT.avantSuppression],
		afterDelete: [RAFRAICHISSEMENT.apresSuppression],
	},
	fields: [
		{ name: 'title', label: 'Titre', type: 'text', required: true },
		champSlug('/talent'),
		{ name: 'seo_title', label: 'Titre pour les moteurs de recherche', type: 'text' },
		{ name: 'description', label: 'Présentation', type: 'textarea' },
		{ name: 'seo_description', label: 'Description pour les moteurs de recherche', type: 'textarea' },
		{
			name: 'content',
			label: 'Contenu',
			type: 'code',
			admin: { language: 'markdown', description: 'En markdown.' },
		},
		champPublieLe,
		champStrapiId,
	],
}
