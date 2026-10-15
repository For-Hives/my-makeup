import type { CollectionConfig } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { adminSeulement, estAdmin } from '../lib/acces'
import { ETATS_DU_MAIL, STATUTS_DE_DEMANDE, TYPES_DE_DEMANDE } from '../lib/contact/etats'
import { LIMITES_DU_CONTACT } from '../lib/contact/message'

const LIBELLES_DES_TYPES: Record<(typeof TYPES_DE_DEMANDE)[number], string> = { contact: 'Message de contact' }

const LIBELLES_DES_STATUTS: Record<(typeof STATUTS_DE_DEMANDE)[number], string> = {
	nouvelle: 'Nouvelle',
	transmise: 'Transmise à l’équipe',
}

const LIBELLES_DES_ETATS_DU_MAIL: Record<(typeof ETATS_DU_MAIL)[number], string> = {
	'en-attente': 'En cours d’envoi',
	envoye: 'Envoyé',
	echec: 'Échec de l’envoi',
}

/**
 * The messages sent through the contact form (tickets 158 and 159; plan 01 §5 P8; docs/migration/SCHEMA.md).
 *
 * - The server stores the message first, then sends the mail to the team: a mail that does not leave
 *   never loses the message (`etatMail` is then `echec`).
 * - Only an admin reads it. Nobody writes it through an API, an admin included: the server writes it,
 *   through the Local API. A visitor has no account, so the form cannot be an API call of hers. The
 *   rules stay active everywhere else, and the matrix of access plays this collection for every role.
 * - It holds what the visitor typed, so it is never in a log, a mail subject or a measure event.
 */
export const Demandes: CollectionConfig<'demandes'> = {
	slug: 'demandes',
	labels: { singular: 'Message de contact', plural: 'Messages de contact' },
	admin: {
		defaultColumns: ['createdAt', 'type', 'statut', 'etatMail', 'prenom', 'nom'],
		hidden: ({ user }) => !estAdmin(user as Parameters<typeof estAdmin>[0]),
		useAsTitle: 'nom',
	},
	defaultSort: '-createdAt',
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
			defaultValue: 'contact',
			index: true,
			options: TYPES_DE_DEMANDE.map(type => ({ label: LIBELLES_DES_TYPES[type], value: type })),
		},
		{
			name: 'statut',
			label: 'Statut',
			type: 'select',
			required: true,
			defaultValue: 'nouvelle',
			index: true,
			options: STATUTS_DE_DEMANDE.map(statut => ({ label: LIBELLES_DES_STATUTS[statut], value: statut })),
		},
		{
			name: 'etatMail',
			label: 'Email à l’équipe',
			type: 'select',
			required: true,
			defaultValue: 'en-attente',
			index: true,
			options: ETATS_DU_MAIL.map(etat => ({ label: LIBELLES_DES_ETATS_DU_MAIL[etat], value: etat })),
		},
		{ name: 'prenom', label: 'Prénom', type: 'text', required: true, maxLength: LIMITES_DU_CONTACT.prenom },
		{ name: 'nom', label: 'Nom', type: 'text', required: true, maxLength: LIMITES_DU_CONTACT.nom },
		{ name: 'email', label: 'Email', type: 'text', required: true, maxLength: LIMITES_DU_CONTACT.email },
		{
			name: 'telephone',
			label: 'Numéro de téléphone',
			type: 'text',
			required: true,
			maxLength: LIMITES_DU_CONTACT.telephone,
		},
		{ name: 'message', label: 'Message', type: 'textarea', required: true, maxLength: LIMITES_DU_CONTACT.message },
	],
}
