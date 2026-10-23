import type { CollectionConfig } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { adminOnly, hiddenExceptAdmin } from '../lib/access'

export const REMINDER_STATES_COLLECTION = 'reminder-states'

/**
 * What the reminders know of one profile (issue 1006; docs/migration/SCHEMA.md): when the last reminder
 * left, and whether she unsubscribed. At most one row per profile.
 *
 * - No address, no name, no text: the profile is found by its number.
 * - Only an admin reads it. Nobody writes it through an API, an admin included: the server writes it when a
 *   reminder leaves (src/lib/reminders/store.ts) and when the unsubscribe link is opened
 *   (src/app/api/reminders/unsubscribe/route.ts).
 * - The database empties the link when a profile goes (`ON DELETE SET NULL`); the daily purge then takes the
 *   orphan row, and the deletion of an account takes hers at once.
 */
export const ReminderStates: CollectionConfig<'reminder-states'> = {
	slug: REMINDER_STATES_COLLECTION,
	labels: { singular: 'État des relances d’un profil', plural: 'États des relances' },
	admin: {
		defaultColumns: ['profile', 'lastSentAt', 'unsubscribedAt'],
		hidden: hiddenExceptAdmin,
		useAsTitle: 'id',
	},
	defaultSort: '-updatedAt',
	access: {
		read: adminOnly,
		create: () => false,
		update: () => false,
		delete: () => false,
	},
	fields: [
		{ name: 'profile', label: 'Profil', type: 'relationship', relationTo: 'profiles', unique: true, index: true },
		{
			name: 'lastSentAt',
			label: 'Dernière relance envoyée le',
			type: 'date',
			admin: { date: { pickerAppearance: 'dayAndTime' } },
		},
		{
			name: 'unsubscribedAt',
			label: 'Désinscrite le',
			type: 'date',
			admin: { date: { pickerAppearance: 'dayAndTime' } },
		},
	],
}
