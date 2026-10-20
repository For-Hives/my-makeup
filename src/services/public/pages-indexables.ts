/**
 * The public reading of every page that is indexed and has its data in the database (tickets 113 and
 * 114): the publishable profiles, the published talents and the published articles. The sitemap and the
 * plan of the site both read it, so they never list different addresses.
 *
 * - The reading keeps the access rules of the collections (`overrideAccess: false`), as an anonymous
 *   visitor: a draft, and a profile that is not published, are not found. A profile is kept when it is
 *   publishable (`FILTRE_INDEXABLE`); an entirely empty one never is, a hidden one is not published.
 * - The fields are chosen one by one: a slug, a name, the date of the last change. No contact detail.
 * - A list is read in pages of 100. If the pages run out of the bound, or the database fails, the reading
 *   throws: a sitemap with missing addresses would be worse than an error (`sitemap.xml` answers 500).
 *
 * The caller gives the Payload instance. No `next` import: the module is read by the tests too.
 */

import type { Payload } from 'payload'
import { nomAffiche, texte } from '@/lib/profile/nom-affiche'
import { FILTRE_INDEXABLE } from '@/lib/profile/visibilite'
import { estUnSlug } from '@/lib/slug'

/** The size of a page of the reading, and the number of pages past which it fails: 10 000 documents. */
export const TAILLE_DE_LA_PAGE = 100
export const PAGES_MAX = 100

/** A profile as the sitemap and the plan show it. */
export interface ProfilIndexable {
	slug: string
	/** The name of her page (the h1). */
	nom: string
	misAJourLe: string | null
}

/** A talent or an article as the sitemap and the plan show it. */
export interface ContenuIndexable {
	slug: string
	titre: string
	misAJourLe: string | null
}

export interface PagesIndexables {
	profils: ProfilIndexable[]
	talents: ContenuIndexable[]
	articles: ContenuIndexable[]
}

/** What one read of a page of a list gives back. */
interface PageLue<T> {
	docs: T[]
	hasNextPage: boolean
}

/** Every document of a list, page after page; throws rather than stop short. */
async function toutesLesPages<T>(lire: (page: number) => Promise<PageLue<T>>): Promise<T[]> {
	const tous: T[] = []
	for (let page = 1; page <= PAGES_MAX; page += 1) {
		const lue = await lire(page)
		tous.push(...lue.docs)
		if (!lue.hasNextPage) return tous
	}
	throw new Error(`Plus de ${PAGES_MAX} pages de ${TAILLE_DE_LA_PAGE} documents : la liste est coupée.`)
}

const date = (valeur: unknown): string | null => (typeof valeur === 'string' && valeur !== '' ? valeur : null)

/** The publishable profiles, by slug. A slug that is no address is left out: its page would not answer. */
export async function lireLesProfilsIndexables(payload: Payload): Promise<ProfilIndexable[]> {
	const docs = await toutesLesPages(page =>
		payload.find({
			collection: 'profiles',
			where: FILTRE_INDEXABLE,
			select: { slug: true, prenom: true, nom: true, nomArtiste: true, updatedAt: true },
			sort: ['slug', 'id'],
			depth: 0,
			limit: TAILLE_DE_LA_PAGE,
			page,
			pagination: true,
			overrideAccess: false,
		})
	)
	return docs.flatMap(profil =>
		estUnSlug(profil.slug) ? [{ slug: profil.slug, nom: nomAffiche(profil), misAJourLe: date(profil.updatedAt) }] : []
	)
}

/** The published talents, in the order of the home page (publication, then slug). */
export async function lireLesTalentsIndexables(payload: Payload): Promise<ContenuIndexable[]> {
	const docs = await toutesLesPages(page =>
		payload.find({
			collection: 'talents',
			select: { slug: true, title: true, updatedAt: true },
			sort: ['publishedAt', 'slug'],
			depth: 0,
			limit: TAILLE_DE_LA_PAGE,
			page,
			pagination: true,
			overrideAccess: false,
		})
	)
	return docs.flatMap(talent =>
		estUnSlug(talent.slug) && texte(talent.title)
			? [{ slug: talent.slug, titre: texte(talent.title), misAJourLe: date(talent.updatedAt) }]
			: []
	)
}

/** The published articles, the most recent first. */
export async function lireLesArticlesIndexables(payload: Payload): Promise<ContenuIndexable[]> {
	const docs = await toutesLesPages(page =>
		payload.find({
			collection: 'articles',
			select: { slug: true, title: true, updatedAt: true },
			sort: ['-publishedAt', 'slug'],
			depth: 0,
			limit: TAILLE_DE_LA_PAGE,
			page,
			pagination: true,
			overrideAccess: false,
		})
	)
	return docs.flatMap(article =>
		estUnSlug(article.slug) && texte(article.title)
			? [{ slug: article.slug, titre: texte(article.title), misAJourLe: date(article.updatedAt) }]
			: []
	)
}

/** The three lists, read together. */
export async function lireLesPagesIndexables(payload: Payload): Promise<PagesIndexables> {
	const [profils, talents, articles] = await Promise.all([
		lireLesProfilsIndexables(payload),
		lireLesTalentsIndexables(payload),
		lireLesArticlesIndexables(payload),
	])
	return { profils, talents, articles }
}
