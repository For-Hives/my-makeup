import { describe, expect, test } from 'bun:test'
import {
	ARTICLES_ADAPTER,
	type ArticleRow,
	expectedArticles,
	splitArticles,
} from '../../scripts/migration/import/articles'
import { PROFILE_TYPE, TYPE_ARTICLE } from '../../scripts/migration/import/media'

/**
 * Ticket 061: what the import makes of an article of the old site, before and without the database.
 * The runs on the bench are in tests/integration/import-articles.test.ts. Every value here is
 * fictional.
 */

const article = (id: number, modif: Partial<ArticleRow> = {}): ArticleRow => ({
	id,
	title: `Article ${id}`,
	content: '## Titre\r\n\nUn texte fictif.  \n',
	author: 'La rédaction',
	seo_title: `Article ${id}`,
	seo_description: 'Une description fictive.',
	slug: `article-${id}`,
	excerpt: null,
	created_at: '2024-01-01T10:00:00.000Z',
	updated_at: '2024-02-01T10:00:00.000Z',
	published_at: '2024-01-01T10:00:00.000Z',
	...modif,
})

describe('les articles attendus', () => {
	test('chaque champ tel quel ; publié avec sa date, ou brouillon sans date', () => {
		const { expected } = expectedArticles(
			[article(1), article(2, { published_at: null, title: null, excerpt: '' })],
			[]
		)

		expect(expected).toEqual([
			{
				strapiId: 1,
				values: {
					strapiId: 1,
					title: 'Article 1',
					slug: 'article-1',
					author: 'La rédaction',
					excerpt: null,
					seo_title: 'Article 1',
					seo_description: 'Une description fictive.',
					content: '## Titre\r\n\nUn texte fictif.  \n',
					gallery: [],
					_status: 'published',
					publishedAt: '2024-01-01T10:00:00.000Z',
					createdAt: '2024-01-01T10:00:00.000Z',
					updatedAt: '2024-02-01T10:00:00.000Z',
				},
				gaps: [],
			},
			expect.objectContaining({
				strapiId: 2,
				values: expect.objectContaining({ title: null, excerpt: '', _status: 'draft', publishedAt: null }),
			}),
		])
		expect(expected.map(attendu => ARTICLES_ADAPTER.options?.(attendu))).toEqual([{ draft: false }, { draft: true }])
	})

	test('la galerie : les images adoptées dans l’ordre ; un fichier non adopté est signalé, pas inventé', () => {
		const links = [
			{ fichier: 31, entree: 1, type: TYPE_ARTICLE, champ: 'galery' },
			{ fichier: 30, entree: 1, type: TYPE_ARTICLE, champ: 'galery' },
			{ fichier: 32, entree: 1, type: TYPE_ARTICLE, champ: 'galery' },
			// The same identifier, for a profile: not a file of the article.
			{ fichier: 33, entree: 1, type: PROFILE_TYPE, champ: 'image_gallery' },
		]

		const { expected, photosNotCarriedOver: unresumedPhotos } = expectedArticles(
			[article(1)],
			links,
			new Map([
				[30, 300],
				[31, 310],
				[33, 330],
			])
		)

		expect(expected[0]?.values.gallery).toEqual([310, 300])
		expect(unresumedPhotos).toEqual([{ entry: 1, file: 32 }])
	})

	test('un slug qui n’est pas une adresse, ou en double, est refusé et listé ; jamais corrigé', () => {
		const { taken, refused: refuses } = splitArticles([
			article(3, { slug: 'article-1' }),
			article(1),
			article(2, { slug: 'Article Deux' }),
			article(4, { slug: null }),
		])

		expect(taken.map(({ id }) => id)).toEqual([1])
		expect(refuses).toEqual([
			{ strapiId: 2, reason: 'slug-pas-une-adresse', fields: ['slug'] },
			{ strapiId: 3, reason: 'slug-en-double', fields: ['slug'] },
			{ strapiId: 4, reason: 'slug-pas-une-adresse', fields: ['slug'] },
		])
	})
})
