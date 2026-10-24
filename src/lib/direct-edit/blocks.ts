import type { Criterion } from '../profile/completeness'

/**
 * The blocks of her page in edit mode (issue 1022): the `id` of each `EditableBlock`, and which block
 * completes each criterion of the single rule of a profile (src/lib/profile/completeness.ts). The
 * completeness panel and the draft notice read this one table, so a point they list always leads to a block
 * that is on the page. Pure, no editing code: the notice is drawn by the onboarding too.
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
