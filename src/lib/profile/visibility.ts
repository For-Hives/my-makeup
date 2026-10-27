/**
 * Who sees a profile, and where (ticket 071; plan 02 U20): the three rules of the public reading,
 * written once. A public page never decides them again.
 *
 * - **Listed** (the search, the home, the lists): neither hidden, nor unavailable, nor entirely
 *   empty. An availability that was never set counts as available (U20), as on the old site.
 * - **Publishable** (the blocks of the site: the home, the guided search): a photo, a city, a speciality and a
 *   way to be reached, src/lib/profile/completeness.ts. Read from the directory (`DirectoryProfile.publishable`).
 * - **Indexable** (the robots tag, the sitemap, the structured data, the zone pages, IndexNow): publishable AND
 *   rich enough for Google, a description of 100 characters and a priced offer or a gallery photo (same file).
 *   A publishable profile that is not indexable is listed and shown, in noindex.
 * - **Visible** at its address: not hidden. A page for a profile that is visible but cannot be
 *   indexed answers 200 in noindex (ticket 104).
 *
 * Each rule exists twice, on purpose, and a test keeps the two together: a predicate on a document
 * already read, and the filter (`Where`) a read puts in its query. The filters are the ones the
 * database applies on top of the reading rule of the collection; a value that was never stored (`null`) is never a reason to hide a profile,
 * except for the entirely empty flag, which the server sets at every save.
 *
 * Relative imports on purpose: shared with the collections, loaded by the Payload CLI.
 */

import type { Where } from 'payload'
import type { ProfileStatus } from './status'

/** What the rules read of a profile; any field may be absent or null. */
export interface DocumentVisible {
	readonly status?: ProfileStatus | string | null
	readonly available?: boolean | null
	readonly fullyEmpty?: boolean | null
	readonly publishable?: boolean | null
	readonly indexable?: boolean | null
}

/** Visible at its address: not hidden by an admin. */
export const isVisible = ({ status }: DocumentVisible): boolean => status !== 'hidden'

/** Listed: visible, available (never set counts as available) and not entirely empty. */
export const isList = (profil: DocumentVisible): boolean =>
	isVisible(profil) && profil.available !== false && profil.fullyEmpty !== true

/** Indexable: publishable and rich enough for Google (the stored flag `indexable`), and visible. */
export const isIndexable = (profil: DocumentVisible): boolean => isVisible(profil) && profil.indexable === true

/**
 * The filters of `estListe` and `isIndexable`, without the status: a public read of the
 * collection already carries the reading rule (`status` is a field the public may not filter on, and
 * the rule keeps the published profiles, which no hidden profile is). So « visible » is the
 * access rule itself, and a query adds the other conditions only.
 */
export const LISTED_FILTER: Where = {
	and: [{ available: { not_equals: false } }, { fullyEmpty: { not_equals: true } }],
}

/** The filter of `isIndexable`, without the status (see `LISTED_FILTER`). */
export const INDEXABLE_FILTER: Where = { indexable: { equals: true } }
