import type { CollectionConfig, Field } from 'payload'
import {
	adminOuSoiMeme,
	adminSeulement,
	cacheeSaufAdmin,
	champAdminSeulement,
	jamais,
	ROLES_ADMIN,
	type RoleAdmin,
} from '../lib/acces'
import { firstClosedAccount } from '../lib/auth/closed-first-account'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { rateLimitSignIn, releaseSignInSlot } from '../lib/auth/rate-limit-payload'

/** How long a session of the admin panel lasts: 8 hours, then the account logs in again (plan 01 §2.3). */
export const DUREE_SESSION_ADMIN_S = 8 * 60 * 60

/** What the admin panel shows for each role. */
const LIBELLES_DES_ROLES: Record<RoleAdmin, string> = { admin: 'Admin', editor: 'Rédaction' }

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
 * - The role `admin` does everything. The role `editor` reads and changes its own account
 *   only, never its role; the other collections say what it may do there (articles and talents).
 * - A makeup artist has no account here and never opens the panel (collection `pros`).
 * - A session lasts 8 hours.
 * - The sign-in is braked by client address, like the one of the makeup artists (ticket 094), and
 *   the account itself is never locked: knocking on someone's email must not shut her out.
 * - `/api/admins/first-register` is closed, even on an empty table: the accounts are created by
 *   the operating procedure (`bun run admin:creer`, scripts/admin/), never by a visitor, never
 *   imported (docs/migration/SCHEMA.md, §4.2).
 */
export const Admins: CollectionConfig<'admins'> = {
	slug: 'admins',
	labels: { singular: 'Compte admin', plural: 'Comptes admin' },
	admin: { useAsTitle: 'email', defaultColumns: ['email', 'role'], hidden: cacheeSaufAdmin },
	// No lock of the account (AUTH-05, like `pros`): wrong passwords must never shut the owner out
	// for every address. The brake by address is the only one (`rateLimitSignIn`).
	auth: { tokenExpiration: DUREE_SESSION_ADMIN_S, maxLoginAttempts: 0 },
	endpoints: [firstClosedAccount],
	hooks: {
		afterLogin: [releaseSignInSlot()],
		beforeOperation: [rateLimitSignIn()],
	},
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
			defaultValue: 'editor' satisfies RoleAdmin,
			options: ROLES_ADMIN.map(role => ({ label: LIBELLES_DES_ROLES[role], value: role })),
			access: { create: champAdminSeulement, update: champAdminSeulement },
		},
		sessionsFermees,
	],
}
