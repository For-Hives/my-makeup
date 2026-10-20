/**
 * The public reading of the articles for the list of the blog (ticket 107): a card is a title, a
 * slug, an excerpt and a date, nothing else. The reading keeps the access rules of the collection
 * (`overrideAccess: false`), as an anonymous visitor: a draft is not found.
 *
 * The caller gives the Payload instance. No `next` import: the module is read by the tests too.
 */

import type { Payload } from 'payload'
import { text } from '@/lib/profile/display-name'
import { isSlug } from '@/lib/slug'

/** The fields of an article the list reads, and nothing else. */
export const LIST_FIELDS = { slug: true, title: true, excerpt: true, publishedAt: true } as const

/** The most articles one read gives: the site has 10. */
export const ARTICLES_LIMIT = 200

/** An article as the list of the blog shows it. */
export interface ListedArticle {
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
	const value = Date.parse(date)
	return Number.isNaN(value) ? null : value
}

/** The most recent first; an article without a date after the dated ones; ties by slug. */
export function byRecency(a: ListedArticle, b: ListedArticle): number {
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
export async function listArticles(payload: Payload): Promise<ListedArticle[]> {
	const { docs } = await payload.find({
		collection: 'articles',
		select: LIST_FIELDS,
		sort: ['-publishedAt', 'slug'],
		depth: 0,
		limit: ARTICLES_LIMIT,
		pagination: false,
		overrideAccess: false,
	})
	return docs
		.flatMap(article =>
			isSlug(article.slug) && text(article.title)
				? [
						{
							slug: article.slug,
							titre: text(article.title),
							extrait: text(article.excerpt),
							publieLe: article.publishedAt ?? null,
						},
					]
				: []
		)
		.sort(byRecency)
}
