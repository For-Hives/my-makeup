import { randomUUID } from 'node:crypto'
import type {
	CollectionAfterChangeHook,
	CollectionBeforeChangeHook,
	CollectionConfig,
	PayloadRequest,
	RequiredDataFromCollectionSlug,
} from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { adminOuProprietaire, adminSeulement, champAdminSeulement, jamais } from '../lib/acces'
import { premierSlugLibre, slugDeRepli, slugifier } from '../lib/slug'

/**
 * What a creation of an account hands to Payload (`context`) when the account must stay without a
 * profile: the import, for the accounts that have none on the old site (ticket 025), and a test.
 */
export const CONTEXTE_SANS_PROFIL = { profilAutomatique: false } as const

/**
 * The slug a profile holds between its creation and the moment its identifier is known. It starts
 * with a character `slugifier` never writes, so it can never be taken for a real slug, and it never
 * leaves the transaction of the creation.
 */
const PREFIXE_PROVISOIRE = '_provisoire-'

/** Which of these slugs a profile already has, read in the transaction of the request. */
const slugsPris =
	(req: PayloadRequest) =>
	async (candidats: string[]): Promise<ReadonlySet<string>> => {
		const { docs } = await req.payload.find({
			collection: 'profils',
			depth: 0,
			limit: candidats.length,
			overrideAccess: true,
			pagination: false,
			req,
			select: { slug: true },
			where: { slug: { in: candidats } },
		})
		return new Set(docs.map(({ slug }) => slug))
	}

/**
 * A new profile gets its slug from the name of its account, computed by the server with the rule
 * of the old site (src/lib/slug.ts): the first free of `base`, `base-2`, `base-3`… A name that
 * gives no slug (only emojis, or no name) gives `maquilleuse-<identifier of the profile>`, once
 * the identifier is known (`slugDeRepliApresCreation`).
 *
 * The slug is computed once, at the creation: changing a name never changes it (I19), and no API
 * writes it. A slug given by the server itself (the import, with the slug of the old site) is kept.
 */
export const slugALaCreation: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
	if (operation !== 'create' || data.slug) return data
	const pro = Number(typeof data.pro === 'object' && data.pro !== null ? data.pro.id : data.pro)
	const compte = Number.isInteger(pro)
		? await req.payload.findByID({
				collection: 'pros',
				depth: 0,
				disableErrors: true,
				id: pro,
				overrideAccess: true,
				req,
			})
		: null
	const base = slugifier(compte?.nom)
	return { ...data, slug: base ? await premierSlugLibre(base, slugsPris(req)) : `${PREFIXE_PROVISOIRE}${randomUUID()}` }
}

/** The fallback slug, `maquilleuse-<id>`, written as soon as the profile has its identifier. */
export const slugDeRepliApresCreation: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
	if (operation !== 'create' || !String(doc.slug).startsWith(PREFIXE_PROVISOIRE)) return doc
	const slug = await premierSlugLibre(slugDeRepli(doc.id), slugsPris(req))
	await req.payload.update({ collection: 'profils', data: { slug }, depth: 0, id: doc.id, overrideAccess: true, req })
	return { ...doc, slug }
}

/**
 * Creating an account creates its empty profile, in the same transaction: if the profile cannot
 * be created, neither is the account. `CONTEXTE_SANS_PROFIL` leaves the account without one.
 */
export const profilALaCreationDuCompte: CollectionAfterChangeHook = async ({ context, doc, operation, req }) => {
	if (operation !== 'create' || context.profilAutomatique === false) return doc
	// The slug is not given: the collection computes it (`slugALaCreation`).
	const profil = { pro: doc.id } as RequiredDataFromCollectionSlug<'profils'>
	await req.payload.create({ collection: 'profils', data: profil, depth: 0, overrideAccess: true, req })
	return doc
}

/**
 * The public identity of a makeup artist (plan 01 §6.1; docs/migration/SCHEMA.md, §5.2), tied to
 * one account and one only.
 *
 * - She reads and changes her own profile only; an admin reaches every profile; nobody else
 *   reaches any yet (the public reading of published profiles comes with ticket 021).
 * - Nobody creates a profile through an API but an admin: the server creates it with the account.
 * - `pro` (the account that owns it) is written by an admin only; `slug` by the server only, at
 *   the creation; `strapiId` and `legacyUsername` by the import only.
 */
export const Profils: CollectionConfig<'profils'> = {
	slug: 'profils',
	labels: { singular: 'Profil', plural: 'Profils' },
	admin: { useAsTitle: 'slug', defaultColumns: ['slug', 'prenom', 'nom', 'pro'] },
	access: {
		read: adminOuProprietaire,
		create: adminSeulement,
		update: adminOuProprietaire,
		delete: adminSeulement,
	},
	hooks: {
		beforeChange: [slugALaCreation],
		afterChange: [slugDeRepliApresCreation],
	},
	fields: [
		{
			name: 'pro',
			label: 'Compte',
			type: 'relationship',
			relationTo: 'pros',
			required: true,
			unique: true,
			access: { create: champAdminSeulement, update: champAdminSeulement },
		},
		{
			name: 'slug',
			label: 'Adresse du profil',
			type: 'text',
			required: true,
			unique: true,
			access: { create: jamais, update: jamais },
			admin: { readOnly: true, description: 'Calculée à la création du profil, elle ne change plus : /profil/<slug>.' },
		},
		{ name: 'prenom', label: 'Prénom', type: 'text', maxLength: 70 },
		{ name: 'nom', label: 'Nom', type: 'text', maxLength: 70 },
		{ name: 'nomArtiste', label: 'Nom d’artiste', type: 'text', maxLength: 70 },
		{ name: 'specialite', label: 'Spécialité', type: 'text', maxLength: 70 },
		{ name: 'description', label: 'Description', type: 'textarea', maxLength: 2000 },
		{ name: 'disponible', label: 'Disponible', type: 'checkbox', defaultValue: true },
		{
			name: 'legacyUsername',
			label: 'Nom d’utilisateur sur l’ancien site',
			type: 'text',
			access: { create: jamais, update: jamais },
			admin: { readOnly: true, description: 'Sert à rediriger l’ancienne adresse du profil vers la nouvelle.' },
		},
		{
			name: 'strapiId',
			label: 'Identifiant sur l’ancien site',
			type: 'number',
			unique: true,
			access: { create: jamais, update: jamais },
			admin: { readOnly: true },
		},
	],
}
