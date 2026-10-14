import { APIError, type CollectionBeforeDeleteHook, type CollectionConfig, type Endpoint, Forbidden } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { adminOuSoiMeme, adminSeulement, champAdminSeulement, jamais } from '../lib/acces'
import { sessionsFermees } from './Admins'
import { profilALaCreationDuCompte } from './Profils'

/**
 * Payload gives every account collection a « first account » route, which creates an account
 * without access control while the collection is empty. It serves the admin panel, which a makeup
 * artist never opens: here it is closed, so that no anonymous request creates an account through
 * REST, even on an empty database. A collection's own routes come before Payload's.
 */
export const premierCompteFerme: Endpoint = {
	path: '/first-register',
	method: 'post',
	handler: req => {
		throw new Forbidden(req.t)
	},
}

/**
 * An account that still has a profile is not deleted: the profile goes first, then the account.
 * The profile cannot exist without its account (`profils.pro` is required), and the whole
 * deletion of an account (profile, photos, requests) is the work of its own tickets (I36, I37).
 */
export const compteSansProfilAvantSuppression: CollectionBeforeDeleteHook = async ({ id, req }) => {
	const { totalDocs } = await req.payload.count({
		collection: 'profils',
		overrideAccess: true,
		req,
		where: { pro: { equals: id } },
	})
	if (totalDocs > 0)
		throw new APIError('Ce compte a encore un profil : supprimer d’abord le profil, puis le compte.', 409, null, true)
}

/**
 * The accounts of the makeup artists (plan 01 §2.3; docs/migration/SCHEMA.md, §5.1).
 *
 * - She reads and changes her own account only, and never opens the admin panel.
 * - The email is the login: unique, stored in lower case (Payload's own rule), so two addresses
 *   that differ only by their case are the same account.
 * - `bloque` and `_verified` are written by an admin only; `legacyProvider` and `strapiId` by
 *   the import only, never through an API.
 * - `legacyBcrypt`, the password hash of the old site, never leaves the server, not even for an
 *   admin: no API reads or writes it, and Payload strips it from every read.
 * - Nobody creates an account through REST without being an admin: the sign-up of the site goes
 *   through the server (P5 tickets).
 * - Creating an account creates its empty profile (collection `profils`), unless the creation
 *   says otherwise (`CONTEXTE_SANS_PROFIL`).
 *
 * `auth.verify` is on for good: `_verified` exists only while it is (SCHEMA.md, §5.1). How the
 * confirmation email reads, and when the site asks for it, belong to ticket 082.
 */
export const Pros: CollectionConfig<'pros'> = {
	slug: 'pros',
	labels: { singular: 'Compte maquilleuse', plural: 'Comptes maquilleuses' },
	admin: { useAsTitle: 'email', defaultColumns: ['email', 'nom', '_verified', 'bloque'] },
	auth: { verify: true },
	access: {
		admin: () => false,
		read: adminOuSoiMeme('pros'),
		create: adminSeulement,
		update: adminOuSoiMeme('pros'),
		delete: adminSeulement,
		unlock: adminSeulement,
	},
	endpoints: [premierCompteFerme],
	hooks: { afterChange: [profilALaCreationDuCompte], beforeDelete: [compteSansProfilAvantSuppression] },
	fields: [
		{
			name: 'nom',
			label: 'Nom',
			type: 'text',
			admin: { description: 'Nom d’affichage, choisi à l’inscription. Plusieurs comptes peuvent porter le même.' },
		},
		{
			name: 'bloque',
			label: 'Bloqué',
			type: 'checkbox',
			defaultValue: false,
			access: { create: champAdminSeulement, update: champAdminSeulement },
		},
		{
			name: 'legacyProvider',
			label: 'Fournisseur d’origine',
			type: 'text',
			access: { create: jamais, update: jamais },
			admin: {
				readOnly: true,
				description: 'Comment le compte se connectait sur l’ancien site : local, google ou facebook.',
			},
		},
		{
			name: 'strapiId',
			label: 'Identifiant sur l’ancien site',
			type: 'number',
			unique: true,
			access: { create: jamais, update: jamais },
			admin: { readOnly: true },
		},
		{
			name: 'legacyBcrypt',
			type: 'text',
			hidden: true,
			access: { read: jamais, create: jamais, update: jamais },
		},
		{
			// Merged into Payload's own field: only an admin confirms an account by hand.
			name: '_verified',
			type: 'checkbox',
			access: { create: champAdminSeulement, update: champAdminSeulement },
		},
		sessionsFermees,
	],
}
