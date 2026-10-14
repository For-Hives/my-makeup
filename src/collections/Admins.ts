import type { CollectionConfig, Field, FieldHook } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { adminOuSoiMeme, adminSeulement, champAdminSeulement, jamais, ROLES_ADMIN, type RoleAdmin } from '../lib/acces'

/** How long a session of the admin panel lasts: 8 hours, then the account logs in again (plan 01 §2.3). */
export const DUREE_SESSION_ADMIN_S = 8 * 60 * 60

/** What the admin panel shows for each role. */
const LIBELLES_DES_ROLES: Record<RoleAdmin, string> = { admin: 'Admin', redaction: 'Rédaction' }

/**
 * The first account of an empty database is always an `admin`, whatever the form said.
 *
 * Payload's « create the first account » screen posts to `/api/admins/first-register`, which
 * creates the account without access control. It is the only way an anonymous request creates an
 * account through REST: anywhere else, creating an account takes the role `admin`. Without this
 * rule, a first account left on the default role would be a `redaction` that nobody could promote.
 */
export const premierCompteAdmin: FieldHook = ({ operation, req, value }) =>
	operation === 'create' && req.payloadAPI === 'REST' && !req.user ? 'admin' : value

/**
 * The sessions of an account never leave the server, not even for the account itself (plan 02
 * §7.3, I06). Payload reads them by itself, with its own access, to check a session.
 *
 * This declaration is merged into the field Payload adds to every account collection: only the
 * read rule changes. Payload's own rule compares the identifier only, so an account of one
 * collection would read the sessions of the account with the same number in the other one.
 */
export const sessionsFermees: Field = {
	name: 'sessions',
	type: 'array',
	access: { read: jamais },
	fields: [],
}

/**
 * The accounts that open the admin panel.
 *
 * - The role `admin` does everything. The role `redaction` reads and changes its own account
 *   only, never its role; the other collections say what it may do there (articles and talents).
 * - A makeup artist has no account here and never opens the panel (collection `pros`).
 * - A session lasts 8 hours.
 *
 * The accounts are created by hand, never imported (docs/migration/SCHEMA.md, §4.2).
 */
export const Admins: CollectionConfig<'admins'> = {
	slug: 'admins',
	labels: { singular: 'Compte admin', plural: 'Comptes admin' },
	admin: { useAsTitle: 'email', defaultColumns: ['email', 'role'] },
	auth: { tokenExpiration: DUREE_SESSION_ADMIN_S },
	access: {
		read: adminOuSoiMeme('admins'),
		create: adminSeulement,
		update: adminOuSoiMeme('admins'),
		delete: adminSeulement,
		unlock: adminSeulement,
	},
	fields: [
		{
			name: 'role',
			label: 'Rôle',
			type: 'select',
			required: true,
			// The narrowest role: an account created without choosing one reaches no account but its own.
			defaultValue: 'redaction' satisfies RoleAdmin,
			options: ROLES_ADMIN.map(role => ({ label: LIBELLES_DES_ROLES[role], value: role })),
			access: { create: champAdminSeulement, update: champAdminSeulement },
			hooks: { beforeChange: [premierCompteAdmin] },
		},
		sessionsFermees,
	],
}
