/**
 * Who sees a profile, and where (ticket 071; plan 02 U20): the three rules of the public reading,
 * written once. A public page never decides them again.
 *
 * - **Listed** (the search, the home, the lists): neither hidden, nor unavailable, nor entirely
 *   empty. An availability that was never set counts as available (U20), as on the old site.
 * - **Indexable** (the robots tag, the sitemap): publishable, the six conditions of
 *   src/lib/profil/completude.ts.
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
import type { StatutDuProfil } from './statut'

/** What the rules read of a profile; any field may be absent or null. */
export interface DocumentVisible {
	readonly statut?: StatutDuProfil | string | null
	readonly disponible?: boolean | null
	readonly entierementVide?: boolean | null
	readonly publiable?: boolean | null
}

/** Visible at its address: not hidden by an admin. */
export const estVisible = ({ statut }: DocumentVisible): boolean => statut !== 'masque'

/** Listed: visible, available (never set counts as available) and not entirely empty. */
export const estListe = (profil: DocumentVisible): boolean =>
	estVisible(profil) && profil.disponible !== false && profil.entierementVide !== true

/** Indexable: publishable, and visible. */
export const estIndexable = (profil: DocumentVisible): boolean => estVisible(profil) && profil.publiable === true

/**
 * The filters of `estListe` and `estIndexable`, without the status: a public read of the
 * collection already carries the reading rule (`statut` is a field the public may not filter on, and
 * the rule keeps the published profiles, which no hidden profile is). So « visible » is the
 * access rule itself, and a query adds the other conditions only.
 */
export const FILTRE_LISTE: Where = {
	and: [{ disponible: { not_equals: false } }, { entierementVide: { not_equals: true } }],
}

/** The filter of `estIndexable`, without the status (see `FILTRE_LISTE`). */
export const FILTRE_INDEXABLE: Where = { publiable: { equals: true } }
