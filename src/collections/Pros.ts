import { APIError, type CollectionBeforeDeleteHook, type CollectionConfig } from 'payload'
import { adminOuSoiMeme, adminSeulement, cacheeSaufAdmin, champAdminSeulement, jamais } from '../lib/acces'
import { closeSessionsOnBlock, recordBlock, refuseBlockedAccount } from '../lib/auth/blocked-account'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { rateLimitSignIn, releaseSignInSlot } from '../lib/auth/rate-limit-payload'
import {
	clearLegacyHashAfterPassword,
	clearLegacyHashOnRenewal,
} from '../lib/auth/legacy-hash-payload'
import {
	recordRestSignIn,
	recordRestSignInFailure,
	recordSignInStart,
	recordLastSignIn,
} from '../lib/auth/auth-log-payload'
import { LINK_DURATION_MS } from '../lib/auth/forgot-password'
import { closeForgotPasswordRestDoors } from '../lib/auth/forgot-payload'
import { firstClosedAccount } from '../lib/auth/closed-first-account'
import { SESSION_DURATION_S, extendUnderCap, refuseAfterCap } from '../lib/auth/sliding-session'
import { equalizeRestWork, rememberRestFailures } from '../lib/auth/equal-time-payload'
import { deleteAccount } from '../lib/account/deletion-route'
import { contenuEmailConfirmation, SUJET_DE_CONFIRMATION } from '../lib/emails/confirmation'
import { composerEmail } from '../lib/emails/gabarit'
import { sessionsFermees } from './Admins'
import { profilALaCreationDuCompte } from './Profiles'

// Kept exported from here: the tests and the earlier tickets import it from this file.
export { firstClosedAccount as premierCompteFerme }

/** How long a session of a makeup artist lasts: 14 days (plan 01 §2.3). */
export const DUREE_SESSION_PRO_S = SESSION_DURATION_S

/**
 * The attributes of the session cookie (I09): HttpOnly always (Payload sets it), SameSite=Lax, and
 * Secure on the deployed site. The sign-in sets it with these same attributes.
 */
export const cookiesDeSession = (production: boolean) => ({ secure: production, sameSite: 'Lax' as const })

/**
 * An account that still has a profile is not deleted by the Local API: the profile goes first, then
 * the account. The profile cannot exist without its account (`profiles.pro` is required). The deletion
 * of an account with everything that hangs on it (profile, photos, sessions) is the one cascade of
 * `src/lib/compte/suppression.ts`, which the makeup artist (ticket 141) and the admin (ticket 167,
 * `DELETE /api/pros/:id`) both call.
 */
export const compteSansProfilAvantSuppression: CollectionBeforeDeleteHook = async ({ id, req }) => {
	const { totalDocs } = await req.payload.count({
		collection: 'profiles',
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
 * - `blocked` and `_verified` are written by an admin only; `legacyProvider` and `strapiId` by
 *   the import only, never through an API.
 * - `legacyBcrypt`, the password hash of the old site, never leaves the server, not even for an
 *   admin: no API reads or writes it, and Payload strips it from every read.
 * - Nobody creates an account through REST without being an admin: the sign-up of the site goes
 *   through the server (P5 tickets).
 * - A blocked account (`blocked`) is turned away at the sign-in once its password is right, and blocking
 *   closes its sessions (ticket 089, src/lib/auth/compte-bloque.ts).
 * - Creating an account creates its empty profile (collection `profiles`), unless the creation
 *   says otherwise (`CONTEXTE_SANS_PROFIL`).
 *
 * `auth.verify` is on for good: `_verified` exists only while it is (SCHEMA.md, §5.1). Whether a
 * new account must confirm its email is the switch AUTH_VERIFY, read by the sign-up
 * (src/lib/auth/inscription-payload.ts); the mail of the sign-up leaves through the door of ticket
 * 073. The mail Payload sends itself, for an account an admin creates in the panel, reads the same
 * and links to the page of the site that confirms the account, not to the admin panel.
 */
export const Pros: CollectionConfig<'pros'> = {
	slug: 'pros',
	labels: { singular: 'Compte maquilleuse', plural: 'Comptes maquilleuses' },
	defaultSort: '-createdAt',
	// The list of the admin (ticket 168): creation date, confirmed address, block, last sign-in and whether
	// a profile exists, the newest account first. The filters are above the table (FiltresDesComptes).
	admin: {
		useAsTitle: 'email',
		defaultColumns: ['email', 'createdAt', '_verified', 'blocked', 'lastSignInAt', 'profile'],
		hidden: cacheeSaufAdmin,
		components: { beforeListTable: ['/components/admin/FiltresDesComptes#FiltresDesComptes'] },
	},
	auth: {
		verify: {
			generateEmailSubject: () => SUJET_DE_CONFIRMATION,
			generateEmailHTML: ({ token }) =>
				composerEmail(
					contenuEmailConfirmation(String(token)),
					process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
				).html,
		},
		// The link of a forgotten password lives one hour and serves once (tickets 085 and 086). The request
		// goes through the site (`demanderUnLien`), which sends the mail by the one door of the site; the native REST doors are closed (`fermerLesPortesRestDeLOubli`).
		forgotPassword: {
			expiration: LINK_DURATION_MS,
		},
		// No lock of the account: the brake is by client address (`freinerLaConnexion`), so that
		// ten wrong passwords typed by anyone never lock the account they aimed at (AUTH-05).
		maxLoginAttempts: 0,
		// 14 days (plan 01 §2.3), renewed by a visit to the space (`RafraichirSession`) and never past 90 days
		// from the opening of the session (ticket 079: the `refresh` hook and the `beforeOperation` one below).
		tokenExpiration: DUREE_SESSION_PRO_S,
		// The token lives in the cookie only: no response of the API carries it (ticket 075).
		removeTokenFromResponses: true,
		cookies: cookiesDeSession(process.env.NODE_ENV === 'production'),
	},
	access: {
		admin: () => false,
		read: adminOuSoiMeme('pros'),
		create: adminSeulement,
		update: adminOuSoiMeme('pros'),
		delete: adminSeulement,
		unlock: adminSeulement,
	},
	// The admin's deletion is the cascade of the account (ticket 167); several accounts at once would skip it.
	disableBulkDelete: true,
	endpoints: [firstClosedAccount, deleteAccount],
	hooks: {
		afterChange: [profilALaCreationDuCompte, clearLegacyHashAfterPassword, recordBlock],
		afterLogin: [releaseSignInSlot(), recordLastSignIn, recordRestSignIn],
		afterError: [rememberRestFailures(), recordRestSignInFailure],
		beforeChange: [closeSessionsOnBlock],
		beforeLogin: [refuseBlockedAccount],
		beforeDelete: [compteSansProfilAvantSuppression],
		beforeValidate: [clearLegacyHashOnRenewal],
		beforeOperation: [
			recordSignInStart,
			rateLimitSignIn(),
			equalizeRestWork(),
			refuseAfterCap,
			closeForgotPasswordRestDoors,
		],
		refresh: [extendUnderCap],
	},
	fields: [
		{
			name: 'name',
			label: 'Nom',
			type: 'text',
			admin: { description: 'Nom d’affichage, choisi à l’inscription. Plusieurs comptes peuvent porter le même.' },
		},
		{
			name: 'blocked',
			label: 'Bloqué',
			type: 'checkbox',
			defaultValue: false,
			access: { create: champAdminSeulement, update: champAdminSeulement },
			admin: {
				position: 'sidebar',
				description: 'Bloquer ferme les sessions ouvertes du compte et refuse sa connexion. Débloquer rend l’accès.',
			},
		},
		{
			// Written by the server at each sign-in, through the Local API: no request writes it (ticket 077).
			name: 'lastSignInAt',
			label: 'Dernière connexion',
			type: 'date',
			access: { create: jamais, update: jamais },
			admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
		},
		{
			name: 'legacyProvider',
			label: 'Fournisseur d’origine',
			type: 'text',
			access: { create: jamais, update: jamais },
			admin: {
				readOnly: true,
				description:
					'Comment le compte se connectait sur l’ancien site : local, google ou facebook. « google » aussi pour un compte créé par la connexion Google, qui ne s’ouvre que pour ceux-là.',
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
			label: 'Adresse confirmée',
			type: 'checkbox',
			access: { create: champAdminSeulement, update: champAdminSeulement },
		},
		sessionsFermees,
		{
			// Virtual: no column, no migration. It reads `profiles.pro`, so the list can tell an account that has a profile.
			name: 'profile',
			label: 'Profil',
			type: 'join',
			collection: 'profiles',
			on: 'pro',
			maxDepth: 0,
			access: { read: champAdminSeulement },
			// The panel's filter builder cannot build a filter on a join field (it crashes): the filters are above the table.
			admin: { components: { Cell: '/components/admin/ProfilDuCompte#ProfilDuCompte' }, disableListFilter: true },
		},
	],
}
