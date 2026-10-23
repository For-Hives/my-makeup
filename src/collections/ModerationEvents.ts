import type { CollectionConfig } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { adminOnly, hiddenExceptAdmin } from '../lib/access'
import { ACTION_LABELS, MODERATION_ACTIONS, REASON_MAX } from '../lib/profile/moderation'

/**
 * The moderation journal (issue 1005): one line each time an admin hides, suspends or restores a profile.
 *
 * - Who (the number of the admin account), what (the action), on which profile (its number), why (the
 *   reason the admin typed) and when. Numbers and the reason only: no name, email or phone is copied here.
 *   The reason is free text typed by an admin, who is told not to put a name in it.
 * - Only an admin reads it. Nobody writes it through an API, an admin included: the server writes the
 *   line in the same transaction as the change of the profile (src/collections/Profiles.ts), so a change
 *   without its line cannot happen. Nothing deletes it: the journal is the trace.
 * - No `createdAt` or `updatedAt`: `date` is the one date.
 */
export const ModerationEvents: CollectionConfig<'moderation-events'> = {
	slug: 'moderation-events',
	labels: { singular: 'Action de modération', plural: 'Journal de modération' },
	admin: {
		defaultColumns: ['date', 'action', 'profile', 'admin', 'reason'],
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
		{ name: 'profile', label: 'Profil (numéro)', type: 'number', required: true, index: true },
		{ name: 'admin', label: 'Admin (numéro du compte)', type: 'number', index: true },
		{
			name: 'action',
			label: 'Action',
			type: 'select',
			required: true,
			index: true,
			options: MODERATION_ACTIONS.map(action => ({ label: ACTION_LABELS[action], value: action })),
		},
		{ name: 'reason', label: 'Motif', type: 'textarea', required: true, maxLength: REASON_MAX },
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
