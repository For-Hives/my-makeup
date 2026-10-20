import type { CollectionConfig } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { adminSeulement, cacheeSaufAdmin } from '../lib/access'

/**
 * The accounts of the old site that were deleted in the v3 (ticket 227; docs/migration/SCHEMA.md).
 *
 * - One row for each deleted account that came from the old site: its identifier on the old site and the
 *   day of the deletion, nothing else. No email, no name, no token: a deleted account leaves nothing
 *   of her behind but the fact that she asked to be forgotten.
 * - The import reads it (scripts/migration/import/garde-bascule.ts) so that a rerun never brings her
 *   account and her profile back from the source, which still holds them.
 * - The server writes it, in the transaction of the deletion (src/lib/account/deletion.ts). Only an
 *   admin reads it, and nobody writes it through an API, an admin included. It is never purged.
 */
export const DeletedAccounts: CollectionConfig<'deleted-accounts'> = {
	slug: 'deleted-accounts',
	labels: { singular: 'Compte supprimé', plural: 'Comptes supprimés' },
	admin: {
		defaultColumns: ['strapiId', 'date'],
		hidden: cacheeSaufAdmin,
		description:
			'Les comptes de l’ancien site supprimés dans la v3. L’import ne les reprend jamais : leur identifiant seul est gardé.',
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
			name: 'strapiId',
			label: 'Identifiant sur l’ancien site',
			type: 'number',
			required: true,
			unique: true,
		},
		{
			name: 'date',
			label: 'Date de la suppression',
			type: 'date',
			required: true,
			index: true,
			defaultValue: () => new Date().toISOString(),
			admin: { date: { pickerAppearance: 'dayAndTime' } },
		},
	],
}
