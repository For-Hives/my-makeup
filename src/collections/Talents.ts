import type { CollectionConfig, TextFieldSingleValidation } from 'payload'
import { text } from 'payload/shared'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { MAX_TITLE, TALENT_MIN_TITLE } from '../lib/seo/text'
import {
	ACCES_REDACTION,
	champPublieLe,
	champSlug,
	champStrapiId,
	datePremierePublication,
	VERSIONS_REDACTION,
} from './editor'
import { rafraichissement } from './revalidate'

/** The refresh of its page, of the pages that list the talents and of the sitemap (ticket 047). */
const RAFRAICHISSEMENT = rafraichissement('talents')

/**
 * The title of the page (the tab, the search results) of a talent, written by the newsroom (ticket 108):
 * left empty, or from 50 to 60 characters and different from the title shown at the top of the page
 * (`seo_title`, the h1). Bing flags the short titles of these pages; the h1 stays the one of the site online.
 */
export const validerTitreDeLaPage: TextFieldSingleValidation = (valeur, args) => {
	const base = text(valeur, args)
	if (base !== true || typeof valeur !== 'string' || valeur.trim() === '') return base
	const titre = valeur.trim()
	if (titre.length < TALENT_MIN_TITLE || titre.length > MAX_TITLE)
		return `Le titre de la page fait de ${TALENT_MIN_TITLE} à ${MAX_TITLE} caractères ; celui-ci en compte ${titre.length}.`
	const titreAffiche = (args.siblingData as { seo_title?: unknown } | undefined)?.seo_title
	const h1 = typeof titreAffiche === 'string' ? titreAffiche.trim() : ''
	if (titre === h1) return 'Le titre de la page doit être différent du titre affiché en haut de la page.'
	return true
}

/**
 * The pages of a speciality, `/talent/<slug>` (plan 01 §6.1; docs/migration/SCHEMA.md, §5.4).
 *
 * - Written by the newsroom (`admin` and `editor`), which creates, publishes, unpublishes and
 *   deletes; everyone else reads the published talents only (`./editor`).
 * - The fields keep their names from the old site, but `pageTitle` is new (ticket 108). Each talent keeps its slug: the import copies
 *   it as it is, so the 14 addresses of today stay the same, and two talents never share one.
 * - `content` is markdown, in a `code` field: Payload limits `text` and `textarea` to 40 000
 *   characters.
 * - A save or a deletion of a talent that is or was published refreshes its page, the home page
 *   and the sitemap; the import refreshes nothing (src/collections/revalidate.ts, ticket 047).
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
		{
			name: 'pageTitle',
			label: 'Titre de la page (onglet et résultats de recherche)',
			type: 'text',
			validate: validerTitreDeLaPage,
			admin: {
				description: `De ${TALENT_MIN_TITLE} à ${MAX_TITLE} caractères, différent du titre affiché en haut de la page. Vide : le titre du talent, suivi du nom du site.`,
			},
		},
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
