/**
 * The talents, `/talent/<slug>` (docs/migration/SCHEMA.md, §5.4): every field is taken as it is,
 * the slug above all, so that the addresses of today stay the same. A talent of the source is
 * published when it has a publication date, a draft otherwise (§7).
 *
 * A slug that does not already have the form of an address, or that two talents share, is refused
 * before any write and listed (rule 5): it is never corrected.
 */

import { TITRES_DES_PAGES_TALENT } from '../../../src/content/talents-titres'
import { estUnSlug } from '../../../src/lib/slug'
import { REFERENCES } from './ecarts'
import type { Adaptateur, Attendu, Refus } from './moteur'
import { iso, type Requete } from './source'

/** A row of `talents`, as the import reads it. */
export interface LigneTalent {
	id: number
	title: string | null
	seo_title: string | null
	description: string | null
	seo_description: string | null
	content: string | null
	slug: string | null
	created_at: string
	updated_at: string
	published_at: string | null
}

export const LECTURE_DES_TALENTS = `SELECT id, title, seo_title, description, seo_description, content, slug,
	${iso('created_at')} AS created_at, ${iso('updated_at')} AS updated_at, ${iso('published_at')} AS published_at
	FROM talents ORDER BY id`

export const lireLesTalents = (requete: Requete): Promise<LigneTalent[]> => requete<LigneTalent>(LECTURE_DES_TALENTS)

export const ADAPTATEUR_TALENTS: Adaptateur = {
	collection: 'talents',
	champs: {
		title: 'texte',
		slug: 'texte',
		seo_title: 'texte',
		description: 'texte',
		seo_description: 'texte',
		pageTitle: 'texte',
		content: 'texte',
		_status: 'texte',
		publishedAt: 'date',
		createdAt: 'date',
		updatedAt: 'date',
	},
	// The source has no title for the tab: the import fills it in, and keeps what the newsroom typed.
	amorces: ['pageTitle'],
	options: attendu => ({ brouillon: attendu.valeurs._status === 'draft' }),
}

/** The talent the target must hold: the same values, under the same names. */
export function talentAttendu(ligne: LigneTalent): Attendu {
	const titreDeLaPage = ligne.slug === null ? undefined : TITRES_DES_PAGES_TALENT[ligne.slug]
	return {
		strapiId: ligne.id,
		valeurs: {
			strapiId: ligne.id,
			title: ligne.title,
			slug: ligne.slug,
			seo_title: ligne.seo_title,
			description: ligne.description,
			seo_description: ligne.seo_description,
			content: ligne.content,
			_status: ligne.published_at === null ? 'draft' : 'published',
			publishedAt: ligne.published_at,
			createdAt: ligne.created_at,
			updatedAt: ligne.updated_at,
			...(titreDeLaPage === undefined ? {} : { pageTitle: titreDeLaPage }),
		},
		ecarts: titreDeLaPage === undefined ? [] : [{ champ: 'pageTitle', reference: REFERENCES.titreDesPagesTalent }],
	}
}

/**
 * The documents of an editorial collection (talents, articles) split in two by their slug: those
 * the import writes, and those it refuses before any write. A slug that is not an address is
 * refused; a slug two documents share stays with the oldest one (the smallest id), and the next
 * ones are refused.
 */
export function repartirParSlug<Ligne extends { id: number; slug: string | null }>(
	lignes: readonly Ligne[]
): { pris: Ligne[]; refuses: Refus[] } {
	const pris: Ligne[] = []
	const refuses: Refus[] = []
	const slugs = new Set<string>()
	for (const ligne of [...lignes].sort((a, b) => a.id - b.id)) {
		if (!estUnSlug(ligne.slug)) refuses.push({ strapiId: ligne.id, motif: 'slug-pas-une-adresse', champs: ['slug'] })
		else if (slugs.has(ligne.slug)) refuses.push({ strapiId: ligne.id, motif: 'slug-en-double', champs: ['slug'] })
		else {
			slugs.add(ligne.slug)
			pris.push(ligne)
		}
	}
	return { pris, refuses }
}

/** The talents of the source split in two by their slug (`repartirParSlug`). */
export function talentsAttendus(lignes: readonly LigneTalent[]): { attendus: Attendu[]; refuses: Refus[] } {
	const { pris, refuses } = repartirParSlug(lignes)
	return { attendus: pris.map(talentAttendu), refuses }
}
