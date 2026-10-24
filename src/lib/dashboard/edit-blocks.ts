import { editPath } from '../direct-edit/edit-mode'
import type { Criterion } from '../profile/completeness'

/**
 * What misses from a profile, and where to complete it (issue 1075). The blocks of her page in edit mode (the `id` of
 * each `EditableBlock`), and the block that completes each criterion of the single rule of a profile
 * (src/lib/profile/completeness.ts). The banner of the edit mode, the draft notice and the summary of her space read
 * this one table, so that a point they list always leads to a block that is on the page (a test reads her page and
 * checks it). Pure, no editing code.
 */

export const BLOCK_IDS = [
	'photo',
	'identity',
	'place',
	'status',
	'about',
	'skills',
	'languages',
	'courses',
	'experiences',
	'services',
	'gallery',
	'travel',
	'networks',
	'contacts',
	'siret',
] as const
export type BlockId = (typeof BLOCK_IDS)[number]

/** The block that completes each criterion. A criterion without one would be a point she cannot act on. */
export const CRITERION_BLOCK: Record<Criterion, BlockId> = {
	nom: 'identity',
	specialite: 'identity',
	nom_artiste: 'identity',
	ville: 'place',
	description: 'about',
	photo: 'photo',
	competences: 'skills',
	experiences: 'experiences',
	formations: 'courses',
	offres: 'services',
	reseaux: 'networks',
	langues: 'languages',
	galerie: 'gallery',
}

/** The block that gives her a way to be reached when a phone or an email would do (the search ranks her last without any). */
export const CONTACT_BLOCK: BlockId = 'contacts'

/** The anchor of a block; the block carries it as its `id`. */
export const blockAnchor = (block: string): string => `bloc-${block}`

/** The address of her page in edit mode, at a block (or at the top when none is given). */
export const editBlockHref = (block: BlockId | null): string =>
	block === null ? editPath() : `${editPath()}#${blockAnchor(block)}`
