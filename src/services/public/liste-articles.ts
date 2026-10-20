/**
 * The public reading of the articles for the list of the blog (ticket 107): a card is a title, a
 * slug, an excerpt and a date, nothing else. The reading keeps the access rules of the collection
 * (`overrideAccess: false`), as an anonymous visitor: a draft is not found.
 *
 * The caller gives the Payload instance. No `next` import: the module is read by the tests too.
 */

import type { Payload } from 'payload'
import { texte } from '@/lib/profile/nom-affiche'
import { estUnSlug } from '@/lib/slug'

/** The fields of an article the list reads, and nothing else. */
export const CHAMPS_DE_LA_LISTE = { slug: true, title: true, excerpt: true, publishedAt: true } as const

/** The most articles one read gives: the site has 10. */
export const LIMITE_DES_ARTICLES = 200

/** An article as the list of the blog shows it. */
export interface ArticleDeLaListe {
	slug: string
	titre: string
	/** Empty when the article has no excerpt. */
	extrait: string
	/** The first publication, as an ISO date; null for an article the import gave no date. */
	publieLe: string | null
}

/** A comparable instant, or null for a missing or unreadable date. */
function instant(date: string | null): number | null {
	if (!date) return null
	const valeur = Date.parse(date)
	return Number.isNaN(valeur) ? null : valeur
}

/** The most recent first; an article without a date after the dated ones; ties by slug. */
export function parRecence(a: ArticleDeLaListe, b: ArticleDeLaListe): number {
	const dateA = instant(a.publieLe)
	const dateB = instant(b.publieLe)
	if (dateA !== dateB) {
		if (dateA === null) return 1
		if (dateB === null) return -1
		return dateB - dateA
	}
	return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0
}

/**
 * The published articles, the most recent first. An article without a title or with a slug that is
 * no address is left out: its link would lead nowhere.
 */
export async function listerLesArticles(payload: Payload): Promise<ArticleDeLaListe[]> {
	const { docs } = await payload.find({
		collection: 'articles',
		select: CHAMPS_DE_LA_LISTE,
		sort: ['-publishedAt', 'slug'],
		depth: 0,
		limit: LIMITE_DES_ARTICLES,
		pagination: false,
		overrideAccess: false,
	})
	return docs
		.flatMap(article =>
			estUnSlug(article.slug) && texte(article.title)
				? [
						{
							slug: article.slug,
							titre: texte(article.title),
							extrait: texte(article.excerpt),
							publieLe: article.publishedAt ?? null,
						},
					]
				: []
		)
		.sort(parRecence)
}
