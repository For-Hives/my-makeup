import type { CollectionConfig } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { adminOnly, hiddenExceptAdmin } from '../lib/access'
import { EVENT_CODES, EVENT_METHODS, EVENT_TYPES } from '../lib/auth/auth-log'

const TYPE_LABELS: Record<(typeof EVENT_TYPES)[number], string> = {
	'sign-in': 'Connexion',
	'sign-out': 'Déconnexion',
	'sign-out-everywhere': 'Déconnexion de tous les appareils',
	'sign-up': 'Inscription',
	confirmation: 'Confirmation de l’email',
	resend: 'Renvoi de l’email de confirmation',
	'forgot-password': 'Demande de lien de mot de passe oublié',
	'password-reset': 'Nouveau mot de passe',
	block: 'Compte bloqué par un admin',
	unblock: 'Compte débloqué par un admin',
}

const CODE_LABELS: Record<(typeof EVENT_CODES)[number], string> = {
	ok: 'Réussi',
	heritee: 'Réussi, mot de passe de l’ancien site',
	'identifiants-invalides': 'Identifiants invalides',
	'trop-de-tentatives': 'Trop de tentatives',
	'service-indisponible': 'Service indisponible',
	'email-non-confirme': 'Email non confirmé',
	'compte-bloque': 'Compte bloqué',
	'donnees-invalides': 'Données invalides',
	'email-deja-pris': 'Email déjà pris',
	'deja-confirme': 'Déjà confirmé',
	'lien-invalide': 'Lien invalide',
	'email-non-verifie': 'Email non vérifié par Google',
	'compte-refuse': 'Compte refusé pour Google',
	annule: 'Annulé chez Google',
	'retour-invalide': 'Retour de Google invalide',
	inconnu: 'Inconnu',
	'champ-piege': 'Champ piège rempli',
}

const METHOD_LABELS: Record<(typeof EVENT_METHODS)[number], string> = {
	password: 'Mot de passe',
	google: 'Google',
}

/**
 * The journal of the authentication events (ticket 077; plan 01 §2.3; docs/migration/SCHEMA.md).
 *
 * - One row for each sign-in, sign-out, sign-up and email confirmation: its kind, its outcome, how
 *   long it took, and when. The kind and the outcome are taken from closed lists
 *   (src/lib/auth/auth-log.ts), and no field holds text: there is nowhere to put an IP, an email, a
 *   name or a token, so none ever lands here, whatever was typed.
 * - Only an admin reads it. Nobody writes it through an API, an admin included: the server writes
 *   it (`log`), and purges it after 90 days (src/lib/tasks/).
 * - No `createdAt` or `updatedAt`: `date` is the one date, and the purge reads it.
 */
export const AuthEvents: CollectionConfig<'auth-events'> = {
	slug: 'auth-events',
	labels: { singular: 'Événement d’authentification', plural: 'Journal d’authentification' },
	admin: {
		defaultColumns: ['date', 'type', 'method', 'code', 'durationMs'],
		hidden: hiddenExceptAdmin,
	},
	defaultSort: '-date',
	timestamps: false,
	access: {
		read: adminOnly,
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
			options: EVENT_TYPES.map(type => ({ label: TYPE_LABELS[type], value: type })),
		},
		{
			name: 'code',
			label: 'Issue',
			type: 'select',
			required: true,
			index: true,
			options: EVENT_CODES.map(code => ({ label: CODE_LABELS[code], value: code })),
		},
		{
			// Ticket 090. Rows older than the Google sign-in have none.
			name: 'method',
			label: 'Méthode',
			type: 'select',
			index: true,
			options: EVENT_METHODS.map(methode => ({ label: METHOD_LABELS[methode], value: methode })),
		},
		{ name: 'durationMs', label: 'Durée (ms)', type: 'number', min: 0 },
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
