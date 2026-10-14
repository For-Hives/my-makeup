import { APIError, type CollectionBeforeDeleteHook, type CollectionConfig, type Endpoint, Forbidden } from 'payload'
import { adminOuSoiMeme, adminSeulement, champAdminSeulement, jamais } from '../lib/acces'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { freinerLaConnexion, rendreLaPlaceDeLaConnexion } from '../lib/auth/frein-payload'
import {
	noterLaConnexionRest,
	noterLEchecDeConnexionRest,
	noterLeDebutDeLaConnexion,
	retenirLaDerniereConnexion,
} from '../lib/auth/journal-payload'
import { sessionsFermees } from './Admins'
import { profilALaCreationDuCompte } from './Profils'

/** How long a session of a makeup artist lasts: 14 days (plan 01 §2.3). */
export const DUREE_SESSION_PRO_S = 14 * 24 * 60 * 60

/**
 * The attributes of the session cookie (I09): HttpOnly always (Payload sets it), SameSite=Lax, and
 * Secure on the deployed site. The sign-in sets it with these same attributes.
 */
export const cookiesDeSession = (production: boolean) => ({ secure: production, sameSite: 'Lax' as const })

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
	auth: {
		verify: true,
		// No lock of the account: the brake is by client address (`freinerLaConnexion`), so that
		// ten wrong passwords typed by anyone never lock the account they aimed at (AUTH-05).
		maxLoginAttempts: 0,
		// 14 days (plan 01 §2.3). Sliding renewal and the 90-day ceiling are ticket 079.
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
	endpoints: [premierCompteFerme],
	hooks: {
		afterChange: [profilALaCreationDuCompte],
		afterLogin: [rendreLaPlaceDeLaConnexion(), retenirLaDerniereConnexion, noterLaConnexionRest],
		afterError: [noterLEchecDeConnexionRest],
		beforeDelete: [compteSansProfilAvantSuppression],
		beforeOperation: [noterLeDebutDeLaConnexion, freinerLaConnexion()],
	},
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
			// Written by the server at each sign-in, through the Local API: no request writes it (ticket 077).
			name: 'derniereConnexion',
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
