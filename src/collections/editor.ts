import type { CollectionBeforeChangeHook, CollectionConfig, Field, TextFieldSingleValidation } from 'payload'
import { text } from 'payload/shared'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { adminEditorOrPublished, adminOrEditor, fieldAdminOrEditor, neverAllowed } from '../lib/access'
import { estUnSlug, SLUG_MAX, slugifier } from '../lib/slug'

/**
 * The rules of writing of the newsroom, shared by its collections: the talents (ticket 022), then
 * the articles (ticket 046), which take the same ones.
 *
 * - The newsroom (`admin` and `editor`) creates, changes, publishes, unpublishes and deletes,
 *   and reads every document, drafts and versions included.
 * - Everyone else, a makeup artist as an anonymous visitor, reads the published documents only.
 * - A document is a draft or published (`_status`); its slug, typed by the newsroom, is unique.
 */

/** Who does what on an editorial collection. */
export const EDITOR_ACCESS = {
	read: adminEditorOrPublished,
	create: adminOrEditor,
	update: adminOrEditor,
	delete: adminOrEditor,
	// Payload's own rule would open the versions, drafts included, to any account with a session.
	readVersions: adminOrEditor,
} satisfies NonNullable<CollectionConfig['access']>

/** Drafts on: each document is a draft or published (`_status`), and keeps its versions. */
export const EDITOR_VERSIONS = { drafts: true } satisfies NonNullable<CollectionConfig['versions']>

/**
 * A slug is refused unless `slugifier` would write it as it is, never corrected in silence: the
 * address of the page is exactly the slug that was typed. The message proposes the right form.
 */
export const validateSlug: TextFieldSingleValidation = (value, args) => {
	const base = text(value, args)
	if (base !== true || typeof value !== 'string' || value === '' || estUnSlug(value)) return base
	const suggestion = slugifier(value)
	return [
		`Une adresse s’écrit en minuscules, sans accent ni espace, les mots séparés par un tiret, ${SLUG_MAX} caractères au plus.`,
		suggestion ? `Par exemple : « ${suggestion} ».` : '',
	]
		.filter(Boolean)
		.join(' ')
}

/**
 * The slug of an editorial document: the end of the address of its page (`chemin` + `/` + slug),
 * unique in its collection, required to publish. The import keeps the slug of the old site as it
 * is, so the addresses already known stay the same.
 */
export const slugFieldDef = (chemin: string): Field => ({
	name: 'slug',
	label: 'Adresse de la page',
	type: 'text',
	required: true,
	unique: true,
	validate: validateSlug,
	admin: {
		position: 'sidebar',
		description: `La page répond à ${chemin}/<adresse>. Changer l’adresse d’une page publiée casse les liens et les résultats de recherche qui y mènent.`,
	},
})

/**
 * The date of the first publication (docs/migration/SCHEMA.md, §7). The import gives the one of
 * the old site; otherwise the server writes it when the document is first published. No API
 * writes it.
 */
export const publishedAtFieldDef: Field = {
	name: 'publishedAt',
	label: 'Publié le',
	type: 'date',
	access: { create: neverAllowed, update: neverAllowed },
	admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
}

/**
 * Writes `publishedAt` when a document is published and has no date yet. A date already there
 * (an earlier publication, or the one the import gives) is kept.
 */
export const firstPublicationDate: CollectionBeforeChangeHook = ({ data }) =>
	data._status === 'published' && !data.publishedAt ? { ...data, publishedAt: new Date().toISOString() } : data

/**
 * The identifier of the document on the old site (docs/migration/SCHEMA.md, rule 1): written by
 * the import only, read by the newsroom only, never by the public.
 */
export const strapiIdFieldDef: Field = {
	name: 'strapiId',
	label: 'Identifiant sur l’ancien site',
	type: 'number',
	unique: true,
	access: { read: fieldAdminOrEditor, create: neverAllowed, update: neverAllowed },
	admin: { position: 'sidebar', readOnly: true },
}
