import type { CollectionConfig } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { adminOnly, hiddenExceptAdmin } from '../lib/access'
import { ACTIVITY_OUTCOME_LABELS, ACTIVITY_OUTCOMES } from '../lib/activity/outcome'

export const ACTIVITY_CHECKS_COLLECTION = 'activity-checks'

/**
 * What the check of the SIRET of one profile answered (issue 1004; docs/migration/SCHEMA.md): the cache of the
 * business registry, with the date of the check. At most one row per profile, and only for a profile that has
 * a SIRET.
 *
 * - Kept off the profile on purpose: a daily write on a profile would renew its `updatedAt`, which the
 *   directory sorts by (src/lib/search/ranking.ts), and would give the badge a place in the ranking.
 * - No copy of the SIRET: the row belongs to the SIRET the profile holds. A hook of the profile resets the row
 *   when the SIRET changes and deletes it when the SIRET is emptied, so that the registry is never asked again
 *   for a number that did not change.
 * - Only an admin reads it. Nobody writes it through an API: the server writes it (src/lib/activity/store.ts).
 * - The database empties the link when a profile goes (`ON DELETE SET NULL`); the profile deletes its row at once
 *   (a hook), and the daily task takes any orphan.
 */
export const ActivityChecks: CollectionConfig<'activity-checks'> = {
	slug: ACTIVITY_CHECKS_COLLECTION,
	labels: { singular: 'Contrôle d’activité d’un profil', plural: 'Contrôles d’activité' },
	admin: {
		defaultColumns: ['profile', 'outcome', 'checkedAt', 'attemptedAt'],
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
			name: 'outcome',
			label: 'Résultat',
			type: 'select',
			required: true,
			defaultValue: 'pending',
			index: true,
			options: ACTIVITY_OUTCOMES.map(value => ({ label: ACTIVITY_OUTCOME_LABELS[value], value })),
		},
		{
			name: 'checkedAt',
			label: 'Dernière réponse lue le',
			type: 'date',
			admin: { date: { pickerAppearance: 'dayAndTime' } },
		},
		{
			name: 'attemptedAt',
			label: 'Dernier essai le',
			type: 'date',
			admin: { date: { pickerAppearance: 'dayAndTime' } },
		},
	],
}
