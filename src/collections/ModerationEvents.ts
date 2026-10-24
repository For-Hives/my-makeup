import type { CollectionConfig } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { adminOnly, hiddenExceptAdmin } from '../lib/access'
import { LEGACY_FEATURE_ACTIONS } from '../lib/profile/featured'
import { ACTION_LABELS, MODERATION_ACTIONS, REASON_MAX } from '../lib/profile/moderation'
import { VERIFY_ACTIONS } from '../lib/profile/verified'

/**
 * The moderation journal (issue 1005): one line each time an admin hides, suspends or restores a profile. Issue 1066
 * adds two lines of the same kind, `feature` and `unfeature`: an admin ticked or unticked « Mise en avant » (no reason).
 * Issue 1066 replaces that box by « Vérifiée »: its changes write `verify` and `unverify` (no reason either), and the
 * two older actions stay in the enum and in the rows already written, so that the history keeps reading.
 *
 * - Who (the number of the admin account), what (the action), on which profile (its number), why (the
 *   reason the admin typed) and when. Numbers and the reason only: no name, email or phone is copied here.
 *   The reason is free text typed by an admin, who is told not to put a name in it.
 * - Only an admin reads it. Nobody writes it through an API, an admin included: the server writes the
 *   line in the same transaction as the change of the profile (src/collections/Profiles.ts), so a change
 *   without its line cannot happen. Nothing deletes it through an API: the journal is the trace. Only the daily purge removes a line, 60 months
 *   after its date (src/lib/tasks/moderation-events.ts); deleting an admin account keeps its lines (a number, no link).
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
			options: [...MODERATION_ACTIONS, ...LEGACY_FEATURE_ACTIONS, ...VERIFY_ACTIONS].map(action => ({
				label: ACTION_LABELS[action],
				value: action,
			})),
		},
		// Required for hiding, suspending and restoring (the hooks of the profile ask for it); a line of « Vérifiée » or
		// of the old « Mise en avant » has none (issue 1066).
		{ name: 'reason', label: 'Motif', type: 'textarea', maxLength: REASON_MAX },
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
