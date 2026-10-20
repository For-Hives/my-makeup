/**
 * The public reading of every page that is indexed and has its data in the database (tickets 113 and
 * 114): the publishable profiles, the published talents and the published articles. The sitemap and the
 * plan of the site both read it, so they never list different addresses.
 *
 * - The reading keeps the access rules of the collections (`overrideAccess: false`), as an anonymous
 *   visitor: a draft, and a profile that is not published, are not found. A profile is kept when it is
 *   publishable (`INDEXABLE_FILTER`); an entirely empty one never is, a hidden one is not published.
 * - The fields are chosen one by one: a slug, a name, the date of the last change. No contact detail.
 * - A list is read in pages of 100. If the pages run out of the bound, or the database fails, the reading
 *   throws: a sitemap with missing addresses would be worse than an error (`sitemap.xml` answers 500).
 *
 * The caller gives the Payload instance. No `next` import: the module is read by the tests too.
 */

import type { Payload } from 'payload'
import { displayName, text } from '@/lib/profile/display-name'
import { INDEXABLE_FILTER } from '@/lib/profile/visibility'
import { estUnSlug } from '@/lib/slug'

/** The size of a page of the reading, and the number of pages past which it fails: 10 000 documents. */
export const PAGE_SIZE = 100
export const PAGES_MAX = 100

/** A profile as the sitemap and the plan show it. */
export interface IndexableProfile {
	slug: string
	/** The name of her page (the h1). */
	nom: string
	misAJourLe: string | null
}

/** A talent or an article as the sitemap and the plan show it. */
export interface IndexableContent {
	slug: string
	titre: string
	misAJourLe: string | null
}

export interface IndexablePages {
	profils: IndexableProfile[]
	talents: IndexableContent[]
	articles: IndexableContent[]
}

/** What one read of a page of a list gives back. */
interface PageRead<T> {
	docs: T[]
	hasNextPage: boolean
}

/** Every document of a list, page after page; throws rather than stop short. */
async function allPages<T>(lire: (page: number) => Promise<PageRead<T>>): Promise<T[]> {
	const all: T[] = []
	for (let page = 1; page <= PAGES_MAX; page += 1) {
		const read = await lire(page)
		all.push(...read.docs)
		if (!read.hasNextPage) return all
	}
	throw new Error(`Plus de ${PAGES_MAX} pages de ${PAGE_SIZE} documents : la liste est coupée.`)
}

const date = (valeur: unknown): string | null => (typeof valeur === 'string' && valeur !== '' ? valeur : null)

/** The publishable profiles, by slug. A slug that is no address is left out: its page would not answer. */
export async function readIndexableProfiles(payload: Payload): Promise<IndexableProfile[]> {
	const docs = await allPages(page =>
		payload.find({
			collection: 'profiles',
			where: INDEXABLE_FILTER,
			select: { slug: true, prenom: true, nom: true, nomArtiste: true, updatedAt: true },
			sort: ['slug', 'id'],
			depth: 0,
			limit: PAGE_SIZE,
			page,
			pagination: true,
			overrideAccess: false,
		})
	)
	return docs.flatMap(profil =>
		estUnSlug(profil.slug) ? [{ slug: profil.slug, nom: displayName(profil), misAJourLe: date(profil.updatedAt) }] : []
	)
}

/** The published talents, in the order of the home page (publication, then slug). */
export async function readIndexableTalents(payload: Payload): Promise<IndexableContent[]> {
	const docs = await allPages(page =>
		payload.find({
			collection: 'talents',
			select: { slug: true, title: true, updatedAt: true },
			sort: ['publishedAt', 'slug'],
			depth: 0,
			limit: PAGE_SIZE,
			page,
			pagination: true,
			overrideAccess: false,
		})
	)
	return docs.flatMap(talent =>
		estUnSlug(talent.slug) && text(talent.title)
			? [{ slug: talent.slug, titre: text(talent.title), misAJourLe: date(talent.updatedAt) }]
			: []
	)
}

/** The published articles, the most recent first. */
export async function readIndexableArticles(payload: Payload): Promise<IndexableContent[]> {
	const docs = await allPages(page =>
		payload.find({
			collection: 'articles',
			select: { slug: true, title: true, updatedAt: true },
			sort: ['-publishedAt', 'slug'],
			depth: 0,
			limit: PAGE_SIZE,
			page,
			pagination: true,
			overrideAccess: false,
		})
	)
	return docs.flatMap(article =>
		estUnSlug(article.slug) && text(article.title)
			? [{ slug: article.slug, titre: text(article.title), misAJourLe: date(article.updatedAt) }]
			: []
	)
}

/** The three lists, read together. */
export async function readIndexablePages(payload: Payload): Promise<IndexablePages> {
	const [profiles, talents, articles] = await Promise.all([
		readIndexableProfiles(payload),
		readIndexableTalents(payload),
		readIndexableArticles(payload),
	])
	return { profils: profiles, talents, articles }
}
