import { editPath } from '../direct-edit/edit-mode'
import type { Criterion } from '../profile/completeness'
import type { Progress } from './progress'

/**
 * The draft notice (decision of 23/10/2026, issue 1009): a makeup artist whose profile is not publishable
 * is told, in plain words, that her page is not online, what she lacks, and where to go. Nothing is
 * computed here: the missing points are the required ones of `profileProgress`, which reads the single
 * rule of a profile (src/lib/profile/completeness.ts). Pure, no server code.
 */

/** The block of the direct edition (the `id` of its `EditableBlock`) that completes each required point. */
const BLOCK_OF: Partial<Record<Criterion, string>> = {
	specialite: 'identity',
	ville: 'place',
	description: 'about',
	photo: 'photo',
	offres: 'services',
	reseaux: 'networks',
}

/** The anchor of a block of the direct edition; the block carries it as its `id`. */
export const blockAnchor = (block: string): string => `bloc-${block}`

export interface DraftNotice {
	/** What she lacks, one sentence each, in the order of her profile. */
	readonly lines: readonly string[]
	/** The first block to complete, in the direct edition. */
	readonly href: string
}

/** The notice of a profile that is not publishable yet, or null: a publishable, hidden or internal profile has none. */
export function draftNotice(progress: Pick<Progress, 'etat' | 'manques'>): DraftNotice | null {
	if (progress.etat !== 'vide' && progress.etat !== 'incomplet') return null
	const required = progress.manques.filter(point => point.requis)
	if (required.length === 0) return null
	const block = BLOCK_OF[required[0]?.critere as Criterion]
	return {
		lines: required.map(point => point.texte),
		href: block === undefined ? editPath() : `${editPath()}#${blockAnchor(block)}`,
	}
}
