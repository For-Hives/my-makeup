import { profilePath } from '../slug'
import { type MissingItem, missingItems } from './draft-notice'
import type { Progress } from './progress'

/**
 * What the banner at the top of her page in edit mode says (issue 1072): whether her page is visible to everyone and,
 * when it is not, everything that is missing, each point a link to its block. Nothing is computed here: the state and
 * the points come from `profileProgress`, which reads the single rule of a profile (src/lib/profile/completeness.ts),
 * and the block of each point from `CRITERION_BLOCK` (src/lib/dashboard/edit-blocks.ts). Pure, no server code.
 */

export type EditBanner =
	/** Not visible yet: nothing, or not enough, is filled (`draft` when entirely empty). */
	| { state: 'draft' | 'incomplete'; items: readonly MissingItem[] }
	/** Visible to everyone: the way to the public page. `paused` when she set herself unavailable. */
	| { state: 'publishable'; href: string; paused: boolean }
	/** Hidden by the team: no list, there is nothing she can fill to change it. */
	| { state: 'hidden' | 'suspended' | 'internal'; note: string }

export function editBanner(
	progress: Pick<Progress, 'etat' | 'manques' | 'enPause' | 'consequence'>,
	profile: { slug: string; moderationAction?: string | null }
): EditBanner {
	switch (progress.etat) {
		case 'masque':
			return { state: profile.moderationAction === 'suspend' ? 'suspended' : 'hidden', note: progress.consequence }
		case 'interne':
			return { state: 'internal', note: progress.consequence }
		case 'publiable':
			return { state: 'publishable', href: profilePath(profile.slug), paused: progress.enPause }
		case 'vide':
			return { state: 'draft', items: missingItems(progress) }
		default:
			return { state: 'incomplete', items: missingItems(progress) }
	}
}
