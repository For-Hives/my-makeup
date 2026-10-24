/**
 * « Mise en avant » (issue 1066): the profiles the team picks for the home page. An admin ticks the box on the
 * profile; the home page shows at most FEATURED_MAX of them, and only those a visitor could open (publishable,
 * listed, reachable: the same rules as the block under a page of text). The « Activité vérifiée » badge is not a
 * criterion: it may become a tie-break one day, if the team decides so.
 *
 * Relative imports on purpose: shared with the collections, loaded by the Payload CLI.
 */

/** The most cards the home page shows, whatever the number of ticked profiles. */
export const FEATURED_MAX = 6

/** The two lines this adds to the journal of the admin's actions on a profile (`moderation-events`). */
export const FEATURE_ACTIONS = ['feature', 'unfeature'] as const
export type FeatureAction = (typeof FEATURE_ACTIONS)[number]

interface Stored {
	readonly featured?: unknown
}

/**
 * The action a save makes on the box, from the stored profile and the data it now holds, or null when the box
 * is left as it is (not sent, or sent with the value it already had).
 */
export function featureActionOf(before: Stored | null | undefined, after: Stored): FeatureAction | null {
	if (typeof after.featured !== 'boolean') return null
	const was = before?.featured === true
	if (after.featured === was) return null
	return after.featured ? 'feature' : 'unfeature'
}
