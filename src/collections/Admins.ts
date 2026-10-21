import type { CollectionConfig, Field } from 'payload'
import {
	adminOnly,
	adminOrSelf,
	fieldAdminOnly,
	hiddenExceptAdmin,
	neverAllowed,
	ROLES_ADMIN,
	type RoleAdmin,
} from '../lib/access'
import { firstClosedAccount } from '../lib/auth/closed-first-account'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { closeAdminForgotPasswordRestDoors } from '../lib/auth/forgot-payload'
import { rateLimitSignIn, releaseSignInSlot } from '../lib/auth/rate-limit-payload'

/** How long a session of the admin panel lasts: 8 hours, then the account logs in again (plan 01 §2.3). */
export const ADMIN_SESSION_DURATION_S = 8 * 60 * 60

/**
 * The attributes of the session cookie of the panel (ticket 272): HttpOnly always (Payload sets it),
 * SameSite=Lax, and Secure on the deployed site, like the cookie of the makeup artists. Without
 * this block, Payload's default is `secure: false` and the token could leave on a first request
 * in `http://`, before the browser has met the HSTS header.
 */
export const adminSessionCookies = (production: boolean) => ({ secure: production, sameSite: 'Lax' as const })

/** What the admin panel shows for each role. */
const ROLE_LABELS: Record<RoleAdmin, string> = { admin: 'Admin', editor: 'Rédaction' }

/**
 * The sessions of an account never leave the server, not even for the account itself (plan 02
 * §7.3, I06). Payload reads them by itself, with its own access, to check a session.
 *
 * This declaration is merged into the field Payload adds to every account collection: only the
 * read rule changes. Payload's own rule compares the identifier only, so an account of one
 * collection would read the sessions of the account with the same number in the other one.
 */
export const closedSessions: Field = {
	name: 'sessions',
	type: 'array',
	access: { read: neverAllowed },
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
 * - `/api/admins/forgot-password` and `/reset-password` are closed (403, ticket 272): a forgotten admin
 *   password is replaced by the operating procedure (README, « Créer un compte admin »), never by a
 *   visitor, and nobody can empty the sending quota by knocking on an admin address.
 * - `/api/admins/first-register` is closed, even on an empty table: the accounts are created by
 *   the operating procedure (`bun run admin:create`, scripts/admin/), never by a visitor, never
 *   imported (docs/migration/SCHEMA.md, §4.2).
 */
export const Admins: CollectionConfig<'admins'> = {
	slug: 'admins',
	labels: { singular: 'Compte admin', plural: 'Comptes admin' },
	admin: { useAsTitle: 'email', defaultColumns: ['email', 'role'], hidden: hiddenExceptAdmin },
	// No lock of the account (AUTH-05, like `pros`): wrong passwords must never shut the owner out
	// for every address. The brake by address is the only one (`rateLimitSignIn`).
	// `forgotPassword` and `resetPassword` through REST are closed (`closeAdminForgotPasswordRestDoors`, ticket 272).
	auth: {
		tokenExpiration: ADMIN_SESSION_DURATION_S,
		maxLoginAttempts: 0,
		cookies: adminSessionCookies(process.env.NODE_ENV === 'production'),
	},
	endpoints: [firstClosedAccount],
	hooks: {
		afterLogin: [releaseSignInSlot()],
		beforeOperation: [rateLimitSignIn(), closeAdminForgotPasswordRestDoors],
	},
	access: {
		read: adminOrSelf('admins'),
		create: adminOnly,
		update: adminOrSelf('admins'),
		delete: adminOnly,
		unlock: adminOnly,
	},
	fields: [
		{
			name: 'role',
			label: 'Rôle',
			type: 'select',
			required: true,
			// The narrowest role: an account created without choosing one reaches no account but its own.
			defaultValue: 'editor' satisfies RoleAdmin,
			options: ROLES_ADMIN.map(role => ({ label: ROLE_LABELS[role], value: role })),
			access: { create: fieldAdminOnly, update: fieldAdminOnly },
		},
		closedSessions,
	],
}
