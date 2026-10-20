/**
 * The public reading of the articles of the blog (ticket 106): the page of one article reads it, and
 * nothing else. The fields are chosen one by one, and the reading keeps the access rules of the
 * collection (`overrideAccess: false`), as an anonymous visitor: a draft, or an unknown slug, is not
 * found (404 in French, E59).
 *
 * The caller gives the Payload instance. No `next` import: the module is read by the tests too.
 */

import type { Payload } from 'payload'
import { texte } from '@/lib/profile/nom-affiche'
import { estUnSlug } from '@/lib/slug'

/** The fields of an article a public page reads, and nothing else. */
export const CHAMPS_DE_L_ARTICLE = {
	slug: true,
	title: true,
	author: true,
	excerpt: true,
	seo_title: true,
	seo_description: true,
	content: true,
	publishedAt: true,
	createdAt: true,
	updatedAt: true,
} as const

/** An article as its page shows it. A field never filled in is an empty string, never `null`. */
export interface ArticlePublic {
	slug: string
	titre: string
	auteur: string
	extrait: string
	/** The title for the search engines, empty when the newsroom wrote none. */
	titreSeo: string
	descriptionSeo: string
	/** The markdown as written: the page converts it (src/lib/markdown.ts). */
	contenu: string
	/** ISO dates: first publication (the creation when unknown), last change. */
	publieLe: string
	modifieLe: string
}

/** The published article of this slug, or `null`: unknown, a draft, or not even a slug. */
export async function lireUnArticlePublic(payload: Payload, slug: string): Promise<ArticlePublic | null> {
	if (!estUnSlug(slug)) return null
	const { docs } = await payload.find({
		collection: 'articles',
		where: { slug: { equals: slug } },
		select: CHAMPS_DE_L_ARTICLE,
		depth: 0,
		limit: 1,
		pagination: false,
		overrideAccess: false,
	})
	const article = docs[0]
	if (!article || !estUnSlug(article.slug) || !texte(article.title)) return null
	return {
		slug: article.slug,
		titre: texte(article.title),
		auteur: texte(article.author),
		extrait: texte(article.excerpt),
		titreSeo: texte(article.seo_title),
		descriptionSeo: texte(article.seo_description),
		contenu: typeof article.content === 'string' ? article.content : '',
		publieLe: article.publishedAt ?? article.createdAt,
		modifieLe: article.updatedAt,
	}
}
