/**
 * What the address of a profile, `/profil/<segment>`, leads to (ticket 104; plan 01 §6.3, plan 02 U13
 * and U61): the rule is written once and the page applies it to the profiles a read gave.
 *
 * - The segment is the slug of a profile: that profile answers (the slug wins, even when it is also the
 *   old username of another profile, so that an indexed address never changes hands).
 * - The segment is the exact old username of a profile (`legacyUsername`, kept as the old site had it):
 *   a 308 to its slug. When two profiles share it, the oldest one (creation date, then identifier).
 * - The segment is a variant of a slug (capitals, accents, spaces): a 308 to that slug.
 * - Anything else, and anything that leads to a hidden profile: nothing, so a 404. A redirection
 *   never ends on a 404.
 *
 * Relative imports on purpose: shared with the unit tests, no `next` import.
 */

import { slugifier } from '../slug'
import { type DocumentVisible, estVisible } from './visibility'

/** The longest segment worth looking up: a slug has 70 characters, an old username fewer than 100. */
export const SEGMENT_MAX = 200

/** A profile a lookup of an address gave. */
export interface CandidatDeLAdresse extends DocumentVisible {
	id: number | string
	slug: string
	legacyUsername?: string | null
	createdAt?: string | null
}

/** What an address leads to. */
export type CibleDeLAdresse<T extends CandidatDeLAdresse = CandidatDeLAdresse> =
	| { type: 'profil'; profil: T }
	| { type: 'redirection'; slug: string }
	| { type: 'inconnue' }

const INCONNUE = { type: 'inconnue' } as const

/** True when a segment can be looked up: text of a sensible length, no control character (the database refuses a NUL). */
export const segmentRecherchable = (segment: unknown): segment is string =>
	typeof segment === 'string' &&
	segment !== '' &&
	segment.length <= SEGMENT_MAX &&
	// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is refused
	!/[\u0000-\u001f\u007f]/.test(segment)

/**
 * The values a read looks for: the segment as a slug, its slugified form, and the segment as an old username.
 * `null` when the address cannot lead anywhere.
 */
export function valeursARechercher(segment: unknown): { segment: string; slugifie: string } | null {
	if (!segmentRecherchable(segment)) return null
	const slugifie = slugifier(segment)
	return slugifie === '' ? null : { segment, slugifie }
}

const horodatage = (date: string | null | undefined): number => {
	const t = date ? Date.parse(date) : Number.NaN
	return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
}

const plusAncienD = (a: CandidatDeLAdresse, b: CandidatDeLAdresse): number =>
	horodatage(a.createdAt) - horodatage(b.createdAt) ||
	Number(a.id) - Number(b.id) ||
	String(a.id).localeCompare(String(b.id))

/**
 * What the segment leads to, among the profiles that could be its target (those whose slug is the
 * segment or its slugified form, or whose old username is the segment).
 */
export function cibleDeLAdresse<T extends CandidatDeLAdresse>(
	segment: unknown,
	candidats: readonly T[]
): CibleDeLAdresse<T> {
	const valeurs = valeursARechercher(segment)
	if (!valeurs) return INCONNUE
	const direct = candidats.find(({ slug }) => slug === valeurs.segment)
	if (direct) return estVisible(direct) ? { type: 'profil', profil: direct } : INCONNUE
	const cible =
		[...candidats].sort(plusAncienD).find(({ legacyUsername }) => legacyUsername === valeurs.segment) ??
		candidats.find(({ slug }) => slug === valeurs.slugifie)
	return cible && estVisible(cible) ? { type: 'redirection', slug: cible.slug } : INCONNUE
}
