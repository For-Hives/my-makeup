/**
 * The public reading of the talents, the pages of a speciality (ticket 097): the home page lists
 * them. A talent is read by its title and its slug, nothing else. The reading keeps the access rules
 * of the collection (`overrideAccess: false`), as an anonymous visitor: a draft is not found.
 *
 * The caller gives the Payload instance. No `next` import: the module is read by the tests too.
 */

import type { Payload } from 'payload'
import { texte } from '@/lib/profile/nom-affiche'
import { estUnSlug } from '@/lib/slug'

/** The fields of a talent a public page reads, and nothing else. */
export const CHAMPS_DU_TALENT = { slug: true, title: true } as const

/** The most talents one read gives: the site has 14. */
export const LIMITE_DES_TALENTS = 100

/** A talent as the home page lists it: its title, and the address of its page. */
export interface TalentPublic {
	slug: string
	titre: string
}

/**
 * The published talents, in the order they were published (the order of the site online), then by
 * slug. A talent without a title or with a slug that is no address is left out: its link would lead
 * nowhere.
 */
export async function listerLesTalents(payload: Payload): Promise<TalentPublic[]> {
	const { docs } = await payload.find({
		collection: 'talents',
		select: CHAMPS_DU_TALENT,
		sort: ['publishedAt', 'slug'],
		depth: 0,
		limit: LIMITE_DES_TALENTS,
		pagination: false,
		overrideAccess: false,
	})
	return docs.flatMap(talent =>
		estUnSlug(talent.slug) && texte(talent.title) ? [{ slug: talent.slug, titre: texte(talent.title) }] : []
	)
}

/** The fields of a talent the page of its speciality reads (ticket 108), and nothing else. */
export const CHAMPS_DE_LA_PAGE_DU_TALENT = {
	slug: true,
	title: true,
	seo_title: true,
	pageTitle: true,
	description: true,
	seo_description: true,
	content: true,
} as const

/** A talent as its page shows it. A field never filled in is an empty string, never `null`. */
export interface TalentDeLaPage {
	slug: string
	/** The short name of the speciality: the breadcrumb, the home page. */
	titre: string
	/** The title at the top of the page, the only h1: `seo_title`, else the title. */
	titreAffiche: string
	/** The title of the tab and of the search results, written by the newsroom; empty when it wrote none. */
	titreDeLaPage: string
	presentation: string
	descriptionSeo: string
	/** The markdown as written: the page converts it (src/lib/markdown.ts). */
	contenu: string
}

/** The published talent of this slug, or `null`: unknown, a draft, or not even a slug. */
export async function lireLeTalent(payload: Payload, slug: string): Promise<TalentDeLaPage | null> {
	if (!estUnSlug(slug)) return null
	const { docs } = await payload.find({
		collection: 'talents',
		where: { slug: { equals: slug } },
		select: CHAMPS_DE_LA_PAGE_DU_TALENT,
		depth: 0,
		limit: 1,
		pagination: false,
		overrideAccess: false,
	})
	const talent = docs[0]
	const titre = texte(talent?.title)
	if (!talent || !estUnSlug(talent.slug) || !titre) return null
	return {
		slug: talent.slug,
		titre,
		titreAffiche: texte(talent.seo_title) || titre,
		titreDeLaPage: texte(talent.pageTitle),
		presentation: texte(talent.description),
		descriptionSeo: texte(talent.seo_description),
		contenu: typeof talent.content === 'string' ? talent.content : '',
	}
}
