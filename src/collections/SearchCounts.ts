import type { CollectionConfig } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { adminOnly, hiddenExceptAdmin } from '../lib/access'
import { DEPARTMENTS } from '../lib/departments'

/**
 * The searches counted by day (issue 1002; docs/migration/SCHEMA.md).
 *
 * - One row for each day (Paris) and département: how many searches, how many with a city, how many
 *   with no result. Numbers and a code of the list of the départements (or `unknown`): no field
 *   holds text typed by a visitor, so there is nowhere to put the words, a city, an address or an identifier.
 * - Only an admin reads it. Nobody writes it through an API, an admin included: the server adds to it
 *   (`recordSearchCount`, src/lib/search/count.ts) and a daily task deletes the rows older than 400 days.
 * - No `createdAt` or `updatedAt`: `day` is the one date, and the purge reads it.
 */
export const SearchCounts: CollectionConfig<'search-counts'> = {
	slug: 'search-counts',
	labels: { singular: 'Compteur de recherches', plural: 'Recherches par jour' },
	admin: {
		defaultColumns: ['day', 'department', 'total', 'withCity', 'noResult'],
		hidden: hiddenExceptAdmin,
	},
	defaultSort: '-day',
	timestamps: false,
	access: {
		read: adminOnly,
		create: () => false,
		update: () => false,
		delete: () => false,
	},
	indexes: [{ fields: ['day', 'department'], unique: true }],
	fields: [
		{
			name: 'day',
			label: 'Jour',
			type: 'date',
			required: true,
			index: true,
			admin: { date: { pickerAppearance: 'dayOnly' } },
		},
		{
			// A code of the départements, or `unknown`: a closed list, so no text can land here.
			name: 'department',
			label: 'Département',
			type: 'select',
			required: true,
			index: true,
			options: [
				...Object.entries(DEPARTMENTS).map(([code, name]) => ({ label: `${code} ${name}`, value: code })),
				{ label: 'Inconnu', value: 'unknown' },
			],
		},
		{ name: 'total', label: 'Recherches', type: 'number', required: true, min: 0, defaultValue: 0 },
		{ name: 'withCity', label: 'Avec une ville', type: 'number', required: true, min: 0, defaultValue: 0 },
		{ name: 'noResult', label: 'Sans résultat', type: 'number', required: true, min: 0, defaultValue: 0 },
	],
}
