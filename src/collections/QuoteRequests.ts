import type { CollectionConfig } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { adminOnly, hiddenExceptAdmin } from '../lib/access'
import {
	QUOTE_LIMITS,
	QUOTE_STATUS_LABELS,
	QUOTE_STATUSES,
	SERVICE_TYPE_LABELS,
	SERVICE_TYPES,
} from '../lib/quote/request'

export const QUOTE_REQUESTS_COLLECTION = 'quote-requests'

const MAIL_STATES = ['pending', 'sent', 'failed'] as const

const MAIL_LABELS: Record<(typeof MAIL_STATES)[number], string> = {
	pending: 'En cours d’envoi',
	sent: 'Envoyé',
	failed: 'Échec de l’envoi',
}

/**
 * The quote requests sent to a makeup artist from her profile (issue 1003; docs/migration/SCHEMA.md).
 *
 * - It holds what the client typed: her first name, her email, her telephone number if she gave one, the date
 *   and the place of her event, the kind of service, her message. It is therefore never public, never listed by a search engine,
 *   and never in a log, a mail subject or a measure event.
 * - Only an admin reads it (to deal with an abuse). Nobody writes it through an API, an admin included: the
 *   server writes it through the Local API, in `src/lib/quote/store.ts`. The makeup artist reads her own
 *   requests in her space and marks them answered, through the server, after it has checked that the request
 *   is on her profile (src/lib/quote/dashboard.ts); she has no access to this collection.
 * - Kept 6 months after the reception, then deleted by the daily task (src/lib/tasks/quote-requests.ts). The
 *   deletion of an account deletes the requests of her profile at once.
 * - The database empties the link when a profile goes (`ON DELETE SET NULL`); the daily purge then takes the
 *   orphan rows.
 */
export const QuoteRequests: CollectionConfig<'quote-requests'> = {
	slug: QUOTE_REQUESTS_COLLECTION,
	labels: { singular: 'Demande de devis', plural: 'Demandes de devis' },
	admin: {
		defaultColumns: ['createdAt', 'profile', 'serviceType', 'eventDate', 'status', 'mailStatus'],
		hidden: hiddenExceptAdmin,
		useAsTitle: 'clientFirstName',
	},
	defaultSort: '-createdAt',
	access: {
		read: adminOnly,
		create: () => false,
		update: () => false,
		delete: () => false,
	},
	fields: [
		{ name: 'profile', label: 'Profil', type: 'relationship', relationTo: 'profiles', index: true },
		{
			name: 'status',
			label: 'Statut',
			type: 'select',
			required: true,
			defaultValue: 'new',
			index: true,
			options: QUOTE_STATUSES.map(status => ({ label: QUOTE_STATUS_LABELS[status], value: status })),
		},
		{
			name: 'mailStatus',
			label: 'Email à la maquilleuse',
			type: 'select',
			required: true,
			defaultValue: 'pending',
			index: true,
			options: MAIL_STATES.map(state => ({ label: MAIL_LABELS[state], value: state })),
		},
		{ name: 'eventDate', label: 'Date de l’événement', type: 'text', required: true, minLength: 10, maxLength: 10 },
		{ name: 'place', label: 'Lieu', type: 'text', required: true, maxLength: QUOTE_LIMITS.place },
		{
			name: 'serviceType',
			label: 'Type de prestation',
			type: 'select',
			required: true,
			options: SERVICE_TYPES.map(type => ({ label: SERVICE_TYPE_LABELS[type], value: type })),
		},
		{ name: 'message', label: 'Message', type: 'textarea', required: true, maxLength: QUOTE_LIMITS.message },
		{
			name: 'clientFirstName',
			label: 'Prénom de la cliente',
			type: 'text',
			required: true,
			maxLength: QUOTE_LIMITS.firstName,
		},
		{ name: 'clientEmail', label: 'Email de la cliente', type: 'text', required: true, maxLength: QUOTE_LIMITS.email },
		{ name: 'clientPhone', label: 'Téléphone de la cliente', type: 'text', maxLength: QUOTE_LIMITS.phone },
		{
			name: 'consentAt',
			label: 'Consentement donné le',
			type: 'date',
			required: true,
			admin: { date: { pickerAppearance: 'dayAndTime' } },
		},
	],
}
