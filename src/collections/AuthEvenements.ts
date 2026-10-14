import type { CollectionConfig } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { adminSeulement, estAdmin } from '../lib/acces'
import { CODES_EVENEMENT, TYPES_EVENEMENT } from '../lib/auth/journal'

const LIBELLES_DES_TYPES: Record<(typeof TYPES_EVENEMENT)[number], string> = {
	connexion: 'Connexion',
	deconnexion: 'Déconnexion',
	'deconnexion-partout': 'Déconnexion de tous les appareils',
	inscription: 'Inscription',
	confirmation: 'Confirmation de l’email',
	renvoi: 'Renvoi de l’email de confirmation',
	'mot-de-passe-oublie': 'Demande de lien de mot de passe oublié',
	reinitialisation: 'Nouveau mot de passe',
}

const LIBELLES_DES_CODES: Record<(typeof CODES_EVENEMENT)[number], string> = {
	ok: 'Réussi',
	'identifiants-invalides': 'Identifiants invalides',
	'trop-de-tentatives': 'Trop de tentatives',
	'service-indisponible': 'Service indisponible',
	'email-non-confirme': 'Email non confirmé',
	'donnees-invalides': 'Données invalides',
	'email-deja-pris': 'Email déjà pris',
	'deja-confirme': 'Déjà confirmé',
	'lien-invalide': 'Lien invalide',
	inconnu: 'Inconnu',
	'champ-piege': 'Champ piège rempli',
}

/**
 * The journal of the authentication events (ticket 077; plan 01 §2.3; docs/migration/SCHEMA.md).
 *
 * - One row for each sign-in, sign-out, sign-up and email confirmation: its kind, its outcome, how
 *   long it took, and when. The kind and the outcome are taken from closed lists
 *   (src/lib/auth/journal.ts), and no field holds text: there is nowhere to put an IP, an email, a
 *   name or a token, so none ever lands here, whatever was typed.
 * - Only an admin reads it. Nobody writes it through an API, an admin included: the server writes
 *   it (`journaliser`), and purges it after 90 days (src/lib/taches/).
 * - No `createdAt` or `updatedAt`: `date` is the one date, and the purge reads it.
 */
export const AuthEvenements: CollectionConfig<'auth-evenements'> = {
	slug: 'auth-evenements',
	labels: { singular: 'Événement d’authentification', plural: 'Journal d’authentification' },
	admin: {
		defaultColumns: ['date', 'type', 'code', 'dureeMs'],
		hidden: ({ user }) => !estAdmin(user as Parameters<typeof estAdmin>[0]),
	},
	defaultSort: '-date',
	timestamps: false,
	access: {
		read: adminSeulement,
		create: () => false,
		update: () => false,
		delete: () => false,
	},
	fields: [
		{
			name: 'type',
			label: 'Type',
			type: 'select',
			required: true,
			index: true,
			options: TYPES_EVENEMENT.map(type => ({ label: LIBELLES_DES_TYPES[type], value: type })),
		},
		{
			name: 'code',
			label: 'Issue',
			type: 'select',
			required: true,
			index: true,
			options: CODES_EVENEMENT.map(code => ({ label: LIBELLES_DES_CODES[code], value: code })),
		},
		{ name: 'dureeMs', label: 'Durée (ms)', type: 'number', min: 0 },
		{
			name: 'date',
			label: 'Date',
			type: 'date',
			required: true,
			index: true,
			defaultValue: () => new Date().toISOString(),
			admin: { date: { pickerAppearance: 'dayAndTime' } },
		},
	],
}
