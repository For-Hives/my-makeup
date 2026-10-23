/**
 * The moderation of a profile (issue 1005): hide, suspend, restore. Written once; the collection of
 * profiles and the admin panel call it, nothing else decides.
 *
 * - `hide` and `suspend` both take the profile out of the public reading (status `hidden`). The
 *   difference is the word the makeup artist reads and the line of the journal: a hold for an editorial
 *   reason, or a sanction for a broken rule. Nothing else follows from it, and nothing is automatic.
 * - `restore` brings the profile back to the automatic status.
 * - Each action needs a reason, typed by the admin in that request. The reason is read by the makeup
 *   artist (hide, suspend) and kept in the journal (all three). The journal holds numbers and the
 *   reason only: never a name, an email or a phone.
 *
 * Relative imports on purpose: shared with the collections, loaded by the Payload CLI.
 */

export const MODERATION_ACTIONS = ['hide', 'suspend', 'restore'] as const
export type ModerationAction = (typeof MODERATION_ACTIONS)[number]

/** The two actions that keep a profile hidden: what the profile stores. */
export const HOLD_ACTIONS = ['hide', 'suspend'] as const
export type HoldAction = (typeof HOLD_ACTIONS)[number]

export const ACTION_LABELS: Record<ModerationAction, string> = {
	hide: 'Masqué',
	suspend: 'Suspendu',
	restore: 'Rétabli',
}

export const REASON_MIN = 10
export const REASON_MAX = 500

export const REASON_MESSAGE = `Dis pourquoi, en ${REASON_MIN} à ${REASON_MAX} caractères : sans motif, le profil ne change pas d’état.`

/** A reason is usable when, trimmed, it holds 10 to 500 characters. */
export function validReason(reason: unknown): reason is string {
	if (typeof reason !== 'string') return false
	const length = reason.trim().length
	return length >= REASON_MIN && length <= REASON_MAX
}

interface Stored {
	readonly chosenStatus?: unknown
	readonly moderationAction?: unknown
}

const isHold = (value: unknown): value is HoldAction => (HOLD_ACTIONS as readonly unknown[]).includes(value)

/**
 * The action a save makes, from the stored profile and the data it now holds, or null when it makes
 * none: a profile goes from not hidden to hidden (`hide`, or `suspend` when the admin said so), from
 * hidden to anything else (`restore`), or stays hidden under another word (`hide` to `suspend`, and back).
 */
export function moderationActionOf(before: Stored | null | undefined, after: Stored): ModerationAction | null {
	const wasHidden = before?.chosenStatus === 'hidden'
	const willHide = after.chosenStatus === 'hidden'
	if (willHide) {
		const word: HoldAction = isHold(after.moderationAction) ? after.moderationAction : 'hide'
		if (!wasHidden) return word
		const wasWord: HoldAction = isHold(before?.moderationAction) ? before.moderationAction : 'hide'
		return word === wasWord ? null : word
	}
	return wasHidden ? 'restore' : null
}
