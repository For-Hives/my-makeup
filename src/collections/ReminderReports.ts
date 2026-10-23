import type { CollectionConfig } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { adminOnly, hiddenExceptAdmin } from '../lib/access'

export const REMINDER_REPORTS_COLLECTION = 'reminder-reports'

/**
 * The internal report of the reminders (issue 1006; docs/migration/SCHEMA.md): one row a day, written by the
 * daily task (src/lib/tasks/reminders.ts), with numbers and the identifiers of the profiles it would remind.
 *
 * - Nothing personal: no name, no address, no text. A profile is found by its number.
 * - « Dry-run » is the normal state: the row says how many profiles would be reminded and how many accounts
 *   are 24 months inactive, and `sendEnabled` is false. Nothing is sent, hidden or deleted because of it.
 * - Only an admin reads it. Nobody writes it through an API, an admin included: the server writes it, and
 *   deletes it after 92 days.
 * - One row per day: the day (a day of Paris, `AAAA-MM-JJ`) is unique, and the server's later runs of the same
 *   day replace the row.
 */
export const ReminderReports: CollectionConfig<'reminder-reports'> = {
	slug: REMINDER_REPORTS_COLLECTION,
	labels: { singular: 'Rapport des relances', plural: 'Rapports des relances' },
	admin: {
		defaultColumns: ['day', 'incompleteCount', 'inactiveCount', 'sentCount', 'sendEnabled'],
		hidden: hiddenExceptAdmin,
		useAsTitle: 'day',
		description:
			'La liste à blanc des relances : combien de profils seraient relancés, lesquels (par numéro), combien de comptes sont inactifs depuis 24 mois. Rien n’est envoyé tant que REMINDERS_SEND n’est pas « on ».',
	},
	defaultSort: '-day',
	access: {
		read: adminOnly,
		create: () => false,
		update: () => false,
		delete: () => false,
	},
	fields: [
		{
			name: 'day',
			label: 'Jour',
			type: 'text',
			required: true,
			unique: true,
			index: true,
			minLength: 10,
			maxLength: 10,
		},
		{ name: 'incompleteCount', label: 'Profils à relancer', type: 'number', required: true, min: 0 },
		{ name: 'incompleteIds', label: 'Numéros des profils à relancer', type: 'json' },
		{ name: 'inactiveCount', label: 'Comptes inactifs depuis 24 mois', type: 'number', required: true, min: 0 },
		{ name: 'inactiveIds', label: 'Numéros des profils inactifs', type: 'json' },
		{ name: 'sentCount', label: 'Relances envoyées ce jour', type: 'number', required: true, min: 0 },
		{ name: 'sendEnabled', label: 'Envoi réel actif', type: 'checkbox', defaultValue: false },
	],
}
