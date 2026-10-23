import type { CollectionConfig } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { adminOnly, hiddenExceptAdmin } from '../lib/access'
import { PROFILE_VIEWS_COLLECTION } from '../lib/views/profile-views'

/**
 * The daily counter of the views of a profile (ticket 1001; docs/migration/SCHEMA.md).
 *
 * - One row per profile and per day (a day of Paris, `AAAA-MM-JJ`), with a number. Nothing says who
 *   looked: no visitor identifier, no address, no user agent, no cookie. There is nowhere to put them.
 * - Only an admin reads it. Nobody writes it through an API, an admin included: the server counts
 *   (src/services/views/record-view.ts, one atomic statement), and purges after 92 days
 *   (src/lib/tasks/profile-views.ts). A makeup artist reads her own numbers in her space, through the
 *   server, never through this collection.
 * - The pair (profile, day) is unique: two views at once add up, they do not make two rows.
 */
export const ProfileViews: CollectionConfig<'profile-views'> = {
	slug: PROFILE_VIEWS_COLLECTION,
	labels: { singular: 'Vues d’un profil', plural: 'Vues des profils' },
	admin: {
		defaultColumns: ['day', 'profile', 'count'],
		hidden: hiddenExceptAdmin,
	},
	defaultSort: '-day',
	access: {
		read: adminOnly,
		create: () => false,
		update: () => false,
		delete: () => false,
	},
	indexes: [{ fields: ['profile', 'day'], unique: true }],
	fields: [
		// Not required: the database empties the link when a profile goes (`ON DELETE SET NULL`), and the purge takes the orphan rows.
		{ name: 'profile', label: 'Profil', type: 'relationship', relationTo: 'profiles', index: true },
		{ name: 'day', label: 'Jour', type: 'text', required: true, index: true, minLength: 10, maxLength: 10 },
		{ name: 'count', label: 'Vues', type: 'number', required: true, min: 0 },
	],
}
