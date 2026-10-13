import type { CollectionConfig } from 'payload'

/**
 * The accounts that open the admin panel.
 *
 * Skeleton only: no role, no custom access rule, Payload's default session. Until the access
 * matrix lands, any logged-in admin can do everything, and the first visitor of an empty
 * database creates the first account.
 */
export const Admins: CollectionConfig = {
	slug: 'admins',
	admin: { useAsTitle: 'email' },
	auth: true,
	fields: [],
}
