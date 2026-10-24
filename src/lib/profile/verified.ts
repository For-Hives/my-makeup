/**
 * « Vérifiée » (field `profiles.verified`): an admin ticks it when the team has checked a profile. Since issue 1066
 * the verified profiles are the pool of « Mise en avant » on the home page (src/lib/profile/featured.ts). The box is
 * for admins to write and for the owner and the admins to read; no public read returns it.
 *
 * Each change leaves a line in the journal of the admin's actions on a profile (`moderation-events`), numbers only.
 *
 * Relative imports on purpose: shared with the collections, loaded by the Payload CLI.
 */

/** The two lines a change of the box adds to the journal. */
export const VERIFY_ACTIONS = ['verify', 'unverify'] as const
export type VerifyAction = (typeof VERIFY_ACTIONS)[number]

interface Stored {
	readonly verified?: unknown
}

/**
 * The action a save makes on the box, from the stored profile and the data it now holds, or null when the box
 * is left as it is (not sent, or sent with the value it already had).
 */
export function verifyActionOf(before: Stored | null | undefined, after: Stored): VerifyAction | null {
	if (typeof after.verified !== 'boolean') return null
	const was = before?.verified === true
	if (after.verified === was) return null
	return after.verified ? 'verify' : 'unverify'
}
