import { describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { BlogPanel } from '../../src/components/art/BlogCard'
import { blogArt } from '../../src/components/art/blog-art'
import { ArticleList, articleDate } from '../../src/components/blog/ArticleList'
import { ArticleOutline } from '../../src/components/blog/ArticleOutline'
import { ArticleShare } from '../../src/components/blog/ArticleShare'
import { RelatedArticles, relatedArticles } from '../../src/components/blog/RelatedArticles'
import {
	ARTICLES_LIMIT,
	byRecency,
	LIST_FIELDS,
	type ListedArticle,
	listArticles,
} from '../../src/services/public/article-list'

/** The list of the blog (ticket 107), without a database. The run on the bench: tests/integration/blog-list.test.ts. */

const article = (slug: string, publieLe: string | null, extra: Partial<ListedArticle> = {}): ListedArticle => ({
	slug,
	titre: `Titre ${slug}`,
	extrait: `Extrait ${slug}`,
	publieLe,
	...extra,
})

describe('Ordre de la liste', () => {
	test('le plus récent d’abord, sans date à la fin, à égalité par adresse', () => {
		const list = [
			article('b', '2026-01-01T00:00:00.000Z'),
			article('sans-date', null),
			article('a', '2026-01-01T00:00:00.000Z'),
			article('recent', '2026-09-01T00:00:00.000Z'),
			article('illisible', 'pas une date'),
		]
		expect([...list].sort(byRecency).map(({ slug }) => slug)).toEqual(['recent', 'a', 'b', 'illisible', 'sans-date'])
	})
})

describe('Lecture', () => {
	test('lit les champs de la carte, avec les règles d’accès d’une visiteuse et une limite', async () => {
		const readings: Record<string, unknown>[] = []
		const payload = {
			find: async (options: Record<string, unknown>) => {
				readings.push(options)
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

		const list = await listArticles(payload)

		expect(readings).toHaveLength(1)
		expect(readings[0]).toMatchObject({
			collection: 'articles',
			select: LIST_FIELDS,
			limit: ARTICLES_LIMIT,
			overrideAccess: false,
			depth: 0,
		})
		expect(list.map(({ slug }) => slug)).toEqual(['recent', 'ancien', 'sans-date'])
		expect(list[0]).toEqual({
			slug: 'recent',
			titre: 'Récent',
			extrait: 'Un extrait',
			publieLe: '2026-06-01T00:00:00.000Z',
		})
		expect(list[1]?.extrait).toBe('')
		expect(list[2]?.publieLe).toBeNull()
	})
})

describe('Affichage', () => {
	test('la date est en français, à l’heure de Paris', () => {
		expect(articleDate('2026-10-14T10:00:00.000Z')).toBe('14 octobre 2026')
		expect(articleDate('2026-12-31T23:30:00.000Z')).toBe('1 janvier 2027')
		expect(articleDate(null)).toBe('')
		expect(articleDate('hier')).toBe('')
	})

	test('chaque article est un lien vers sa page, par son titre, et la page n’a pas de h1 à elle', () => {
		const html = renderToStaticMarkup(
			<ArticleList articles={[article('un', '2026-10-14T10:00:00.000Z'), article('deux', null, { extrait: '' })]} />
		)

		expect(html).toContain('href="/blog/un"')
		expect(html).toContain('href="/blog/deux"')
		expect(html).toMatch(/<h2[^>]*><a[^>]*href="\/blog\/un"[^>]*>Titre un<\/a><\/h2>/)
		expect(html).toContain('Extrait un')
		expect(html).toContain('14 octobre 2026')
		expect(html).not.toContain('Extrait deux')
		expect(html).not.toContain('<h1')
		// One link per article, named by its title: the « Lire l'article » of a card is decoration.
		expect(html.match(/<a /g)).toHaveLength(2)
	})

	test('le plus récent est en grand, les autres dans la grille, dans l’ordre reçu', () => {
		const html = renderToStaticMarkup(
			<ArticleList
				articles={[article('un', '2026-10-14T10:00:00.000Z'), article('deux', null), article('trois', null)]}
			/>
		)

		expect(html.match(/data-featured/g)).toHaveLength(1)
		expect(html.match(/data-article-card/g)).toHaveLength(2)
		expect(html.indexOf('href="/blog/un"')).toBeLessThan(html.indexOf('data-article-card'))
		expect(html.indexOf('href="/blog/deux"')).toBeLessThan(html.indexOf('href="/blog/trois"'))
		expect(html).toContain('Dernier article')
	})

	test('un seul article : il est en grand et il n’y a pas de grille vide', () => {
		const html = renderToStaticMarkup(<ArticleList articles={[article('un', null)]} />)

		expect(html).toContain('data-featured')
		expect(html).not.toContain('data-article-card')
		expect(html).not.toContain('<ul')
	})

	test('un article a une illustration générée, décorative et sans texte ; sans illustration, le panneau dessiné reste', () => {
		const html = renderToStaticMarkup(<ArticleList articles={[article('un', null, { titre: 'élégance du teint' })]} />)

		expect(html).toMatch(/<div data-panel="true" data-cover="true"/)
		expect(html).toMatch(/<img alt=""[^>]*src="[^"]*blog[^"]*"/)
		expect(html).not.toContain('data-tint')
		// The first letter of the title is no longer the picture.
		expect(html).not.toContain('>É</span>')

		// No illustration to show: the tinted panel with its drawn objects.
		const drawn = renderToStaticMarkup(<BlogPanel slug="un" covers={[]} />)
		expect(drawn).toMatch(/<div aria-hidden="true" data-tint="[a-z]+" data-panel="true"/)
		expect(drawn).toContain('<svg')
		expect(drawn).not.toMatch(/<img/)
	})

	test('les panneaux dessinés de repli restent variés et stables', () => {
		const panel = (slug: string) => renderToStaticMarkup(<BlogPanel slug={slug} covers={[]} />)
		expect(panel('choisir-sa-maquilleuse')).toBe(panel('choisir-sa-maquilleuse'))
		const slugs = ['un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit']
		const looks = new Set(slugs.map(slug => `${blogArt(slug).tint}/${blogArt(slug).object}/${blogArt(slug).side}`))
		expect(looks.size).toBeGreaterThanOrEqual(5)
		for (const slug of slugs) expect(blogArt(slug).second).not.toBe(blogArt(slug).object)
	})

	test('le panneau dessiné de repli est du décor : caché aux lecteurs d’écran, sans titre ni texte, sans étincelle ni fleur', () => {
		const html = renderToStaticMarkup(<BlogPanel slug="un" shape="cover" covers={[]} />)
		expect(html).not.toContain('<title')
		expect(html).not.toMatch(/sparkle|flower|twinkle/i)
		// No text node at all: only tags follow tags.
		expect(html).not.toMatch(/>[^<]+</)
	})

	test('l’illustration est décorative (alt vide), à sa taille réelle, et la grande carte se charge en premier', () => {
		const html = renderToStaticMarkup(<ArticleList articles={[article('un', null), article('deux', null)]} />)
		const images = html.match(/<img [^>]*>/g) ?? []
		expect(images).toHaveLength(2)
		for (const image of images) {
			expect(image).toContain('alt=""')
			expect(image).toContain('width="1200"')
			expect(image).toContain('height="800"')
			expect(image).toContain('sizes="')
		}
		// The large card is the one painted first; the cards of the grid wait for the scroll.
		expect(images[0]).toContain('fetchPriority="high"')
		expect(images[1]).toContain('loading="lazy"')
		expect(images[1]).not.toContain('fetchPriority')
	})

	test('le plus récent porte son étiquette, la grille a une tête de section et chaque carte une flèche décorative', () => {
		const html = renderToStaticMarkup(<ArticleList articles={[article('un', null), article('deux', null)]} />)
		expect(html).toContain('Dernier article')
		expect(html).toMatch(/<h2[^>]*id="tous-les-articles"[^>]*>Tous les articles<\/h2>/)
		expect(html).toContain('aria-labelledby="tous-les-articles"')
		expect(html).toContain('Lire l&#x27;article')
		// Three titles at most share the page: the large one, the head of the grid, the one card.
		expect(html.match(/<h2/g)).toHaveLength(3)
		expect(renderToStaticMarkup(<ArticleList articles={[article('un', null)]} />)).not.toContain('Tous les articles')
	})

	test('un texte d’article ne devient jamais du HTML', () => {
		const html = renderToStaticMarkup(
			<ArticleList articles={[article('un', null, { titre: '<script>alert(1)</script>' })]} />
		)

		expect(html).not.toContain('<script>')
		expect(html).toContain('&lt;script&gt;')
	})

	test('sans article, la page le dit et propose la recherche', () => {
		const html = renderToStaticMarkup(<ArticleList articles={[]} />)

		expect(html).toContain('Aucun article')
		expect(html).toContain('href="/search"')
		expect(html).not.toContain('Reviens')
	})
})

describe('À lire aussi', () => {
	const list = [article('a', '2026-10-04T00:00:00.000Z'), article('b', null), article('c', null), article('d', null)]

	test('les trois plus récents, sans l’article lu', () => {
		expect(relatedArticles(list, 'a').map(({ slug }) => slug)).toEqual(['b', 'c', 'd'])
		expect(relatedArticles(list, 'c').map(({ slug }) => slug)).toEqual(['a', 'b', 'd'])
		expect(relatedArticles(list, 'inconnu')).toHaveLength(3)
	})

	test('un blog d’un seul article n’a aucun article lié, donc aucun bloc', () => {
		expect(relatedArticles([article('a', null)], 'a')).toEqual([])
		expect(renderToStaticMarkup(<RelatedArticles articles={[]} />)).toBe('')
	})

	test('le bloc a un h2, et chaque carte un h3', () => {
		const html = renderToStaticMarkup(<RelatedArticles articles={relatedArticles(list, 'a')} />)

		expect(html).toContain('À lire aussi')
		expect(html.match(/<h2/g)).toHaveLength(1)
		expect(html.match(/<h3/g)).toHaveLength(3)
	})
})

describe('Pied d’article', () => {
	test('retour au blog et trois partages, sans script', () => {
		const html = renderToStaticMarkup(<ArticleShare title="Un titre & plus" url="https://example.test/blog/un" />)

		expect(html).toContain('href="/blog"')
		expect(html).toContain('mailto:?subject=Un%20titre%20%26%20plus&amp;body=https%3A%2F%2Fexample.test%2Fblog%2Fun')
		expect(html).toContain('sharing/share-offsite/?url=https%3A%2F%2Fexample.test%2Fblog%2Fun')
		expect(html).toContain('sharer.php?u=https%3A%2F%2Fexample.test%2Fblog%2Fun')
		expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(2)
		// Chips and a pill: every target is 44 px high at least.
		expect(html.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(4)
		expect(html).not.toContain('<script')
	})
})

describe('Sommaire', () => {
	test('un lien par partie, vers son identifiant', () => {
		const html = renderToStaticMarkup(<ArticleOutline headings={[{ id: 'section-a', text: 'Partie A', level: 2 }]} />)

		expect(html).toContain('href="#section-a"')
		expect(html).toContain('Dans cet article')
	})
	test('sans partie, rien', () => {
		expect(renderToStaticMarkup(<ArticleOutline headings={[]} />)).toBe('')
	})
})
