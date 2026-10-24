import { type Criterion, DESCRIPTION_MIN } from '../profile/completeness'
import { type BlockId, blockAnchor, CRITERION_BLOCK, editBlockHref } from './edit-blocks'
import type { Progress } from './progress'

/**
 * The draft notice (decision of 23/10/2026, issue 1009): a makeup artist whose profile is not publishable
 * is told, in plain words, that her page is not online, what she lacks, and where to go. Nothing is
 * computed here: the missing points are the required ones of `profileProgress`, which reads the single
 * rule of a profile (src/lib/profile/completeness.ts). Pure, no server code.
 */

/** What each required point is called in the sentence « Il te manque : … », short so that the list stays small on a phone. */
const LABEL_OF: Partial<Record<Criterion, string>> = {
	specialite: 'ta spécialité',
	ville: 'ta commune',
	description: `une description de ${DESCRIPTION_MIN} caractères au moins`,
	photo: 'ta photo principale',
	offres: 'une prestation avec un prix en chiffres',
	reseaux: 'un moyen de te contacter',
}

/** The anchor of a block: kept here for the blocks of the direct edition, which import it. */
export { blockAnchor }

/** One point she lacks for a visible page, and the block of her page that completes it (issue 1072). */
export interface MissingItem {
	readonly criterion: Criterion
	readonly label: string
	readonly block: BlockId
	readonly href: string
}

/**
 * The required points of the single rule that her profile does not meet, in the order of her profile, each with its
 * words (those of the draft notice and of the end of the onboarding) and the block that completes it. Nothing is
 * computed here: the points are the `requis` ones of `profileProgress`.
 */
export function missingItems(progress: Pick<Progress, 'manques'>): MissingItem[] {
	return progress.manques
		.filter(point => point.requis)
		.map(point => ({
			criterion: point.critere,
			label: LABEL_OF[point.critere] ?? point.texte,
			block: CRITERION_BLOCK[point.critere],
			href: editBlockHref(CRITERION_BLOCK[point.critere]),
		}))
}

export interface DraftNotice {
	/** What she lacks, a few words each, in the order of her profile. */
	readonly lines: readonly string[]
	/** The first block to complete, in the direct edition. */
	readonly href: string
}

/** The notice of a profile that is not publishable yet, or null: a publishable, hidden or internal profile has none. */
export function draftNotice(progress: Pick<Progress, 'etat' | 'manques'>): DraftNotice | null {
	if (progress.etat !== 'vide' && progress.etat !== 'incomplet') return null
	const items = missingItems(progress)
	if (items.length === 0) return null
	return { lines: items.map(item => item.label), href: items[0]?.href ?? editBlockHref(null) }
}
