import { describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { dateDeLArticle, ListeDesArticles } from '../../src/components/blog/ListeDesArticles'
import {
	type ArticleDeLaListe,
	CHAMPS_DE_LA_LISTE,
	LIMITE_DES_ARTICLES,
	listerLesArticles,
	parRecence,
} from '../../src/services/public/liste-articles'

/** The list of the blog (ticket 107), without a database. The run on the bench: tests/integration/blog-liste.test.ts. */

const article = (slug: string, publieLe: string | null, extra: Partial<ArticleDeLaListe> = {}): ArticleDeLaListe => ({
	slug,
	titre: `Titre ${slug}`,
	extrait: `Extrait ${slug}`,
	publieLe,
	...extra,
})

describe('Ordre de la liste', () => {
	test('le plus récent d’abord, sans date à la fin, à égalité par adresse', () => {
		const liste = [
			article('b', '2026-01-01T00:00:00.000Z'),
			article('sans-date', null),
			article('a', '2026-01-01T00:00:00.000Z'),
			article('recent', '2026-09-01T00:00:00.000Z'),
			article('illisible', 'pas une date'),
		]
		expect([...liste].sort(parRecence).map(({ slug }) => slug)).toEqual(['recent', 'a', 'b', 'illisible', 'sans-date'])
	})
})

describe('Lecture', () => {
	test('lit les champs de la carte, avec les règles d’accès d’une visiteuse et une limite', async () => {
		const lectures: Record<string, unknown>[] = []
		const payload = {
			find: async (options: Record<string, unknown>) => {
				lectures.push(options)
				return {
					docs: [
						{ slug: 'ancien', title: 'Ancien', excerpt: '  ', publishedAt: '2026-01-01T00:00:00.000Z' },
						{ slug: 'Mauvaise Adresse', title: 'Cassé', publishedAt: '2026-10-01T00:00:00.000Z' },
						{ slug: 'sans-titre', title: '  ', publishedAt: '2026-10-02T00:00:00.000Z' },
						{ slug: 'recent', title: 'Récent', excerpt: 'Un extrait', publishedAt: '2026-06-01T00:00:00.000Z' },
						{ slug: 'sans-date', title: 'Sans date' },
					],
				}
			},
		} as unknown as Payload

		const liste = await listerLesArticles(payload)

		expect(lectures).toHaveLength(1)
		expect(lectures[0]).toMatchObject({
			collection: 'articles',
			select: CHAMPS_DE_LA_LISTE,
			limit: LIMITE_DES_ARTICLES,
			overrideAccess: false,
			depth: 0,
		})
		expect(liste.map(({ slug }) => slug)).toEqual(['recent', 'ancien', 'sans-date'])
		expect(liste[0]).toEqual({
			slug: 'recent',
			titre: 'Récent',
			extrait: 'Un extrait',
			publieLe: '2026-06-01T00:00:00.000Z',
		})
		expect(liste[1]?.extrait).toBe('')
		expect(liste[2]?.publieLe).toBeNull()
	})
})

describe('Affichage', () => {
	test('la date est en français, à l’heure de Paris', () => {
		expect(dateDeLArticle('2026-10-14T10:00:00.000Z')).toBe('14 octobre 2026')
		expect(dateDeLArticle('2026-12-31T23:30:00.000Z')).toBe('1 janvier 2027')
		expect(dateDeLArticle(null)).toBe('')
		expect(dateDeLArticle('hier')).toBe('')
	})

	test('chaque article est un lien vers sa page, son titre est un h2 et la page n’a pas de h1 à elle', () => {
		const html = renderToStaticMarkup(
			<ListeDesArticles
				articles={[article('un', '2026-10-14T10:00:00.000Z'), article('deux', null, { extrait: '' })]}
			/>
		)

		expect(html).toContain('href="/blog/un"')
		expect(html).toContain('href="/blog/deux"')
		expect(html).toContain('<h2 class="font-semibold text-gray-900 text-lg">Titre un</h2>')
		expect(html).toContain('Extrait un')
		expect(html).toContain('14 octobre 2026')
		expect(html).not.toContain('Extrait deux')
		expect(html).not.toContain('<h1')
	})

	test('un texte d’article ne devient jamais du HTML', () => {
		const html = renderToStaticMarkup(
			<ListeDesArticles articles={[article('un', null, { titre: '<script>alert(1)</script>' })]} />
		)

		expect(html).not.toContain('<script>')
		expect(html).toContain('&lt;script&gt;')
	})

	test('sans article, la page le dit', () => {
		expect(renderToStaticMarkup(<ListeDesArticles articles={[]} />)).toContain('Aucun article')
	})
})
