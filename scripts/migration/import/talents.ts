/**
 * The talents, `/talent/<slug>` (docs/migration/SCHEMA.md, §5.4): every field is taken as it is,
 * the slug above all, so that the addresses of today stay the same. A talent of the source is
 * published when it has a publication date, a draft otherwise (§7).
 *
 * A slug that does not already have the form of an address, or that two talents share, is refused
 * before any write and listed (rule 5): it is never corrected.
 */

import { TALENT_PAGE_TITLES } from '../../../src/content/talent-titles'
import { isSlug } from '../../../src/lib/slug'
import type { Adapter, Expected, Refusal } from './engine'
import { REFERENCES } from './gaps'
import { iso, type Query } from './source'

/** A row of `talents`, as the import reads it. */
export interface TalentRow {
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

export const TALENTS_QUERY = `SELECT id, title, seo_title, description, seo_description, content, slug,
	${iso('created_at')} AS created_at, ${iso('updated_at')} AS updated_at, ${iso('published_at')} AS published_at
	FROM talents ORDER BY id`

export const readTalents = (requete: Query): Promise<TalentRow[]> => requete<TalentRow>(TALENTS_QUERY)

export const TALENTS_ADAPTER: Adapter = {
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
export function expectedTalent(ligne: TalentRow): Expected {
	const pageTitle = ligne.slug === null ? undefined : TALENT_PAGE_TITLES[ligne.slug]
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
			...(pageTitle === undefined ? {} : { pageTitle: pageTitle }),
		},
		ecarts: pageTitle === undefined ? [] : [{ champ: 'pageTitle', reference: REFERENCES.titreDesPagesTalent }],
	}
}

/**
 * The documents of an editorial collection (talents, articles) split in two by their slug: those
 * the import writes, and those it refuses before any write. A slug that is not an address is
 * refused; a slug two documents share stays with the oldest one (the smallest id), and the next
 * ones are refused.
 */
export function splitBySlug<Ligne extends { id: number; slug: string | null }>(
	lignes: readonly Ligne[]
): { pris: Ligne[]; refuses: Refusal[] } {
	const taken: Ligne[] = []
	const refuses: Refusal[] = []
	const slugs = new Set<string>()
	for (const row of [...lignes].sort((a, b) => a.id - b.id)) {
		if (!isSlug(row.slug)) refuses.push({ strapiId: row.id, motif: 'slug-pas-une-adresse', champs: ['slug'] })
		else if (slugs.has(row.slug)) refuses.push({ strapiId: row.id, motif: 'slug-en-double', champs: ['slug'] })
		else {
			slugs.add(row.slug)
			taken.push(row)
		}
	}
	return { pris: taken, refuses }
}

/** The talents of the source split in two by their slug (`repartirParSlug`). */
export function expectedTalents(lignes: readonly TalentRow[]): { attendus: Expected[]; refuses: Refusal[] } {
	const { pris: taken, refuses } = splitBySlug(lignes)
	return { attendus: taken.map(expectedTalent), refuses }
}
