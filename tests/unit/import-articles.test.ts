import { describe, expect, test } from 'bun:test'
import {
	ADAPTATEUR_ARTICLES,
	articlesAttendus,
	articlesRepartis,
	type LigneArticle,
} from '../../scripts/migration/import/articles'
import { TYPE_ARTICLE, TYPE_PROFIL } from '../../scripts/migration/import/medias'

/**
 * Ticket 061: what the import makes of an article of the old site, before and without the database.
 * The runs on the bench are in tests/integration/import-articles.test.ts. Every value here is
 * fictional.
 */

const article = (id: number, modif: Partial<LigneArticle> = {}): LigneArticle => ({
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
		const { attendus } = articlesAttendus(
			[article(1), article(2, { published_at: null, title: null, excerpt: '' })],
			[]
		)

		expect(attendus).toEqual([
			{
				strapiId: 1,
				valeurs: {
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
				ecarts: [],
			},
			expect.objectContaining({
				strapiId: 2,
				valeurs: expect.objectContaining({ title: null, excerpt: '', _status: 'draft', publishedAt: null }),
			}),
		])
		expect(attendus.map(attendu => ADAPTATEUR_ARTICLES.options?.(attendu))).toEqual([
			{ brouillon: false },
			{ brouillon: true },
		])
	})

	test('la galerie : les images adoptées dans l’ordre ; un fichier non adopté est signalé, pas inventé', () => {
		const liens = [
			{ fichier: 31, entree: 1, type: TYPE_ARTICLE, champ: 'galery' },
			{ fichier: 30, entree: 1, type: TYPE_ARTICLE, champ: 'galery' },
			{ fichier: 32, entree: 1, type: TYPE_ARTICLE, champ: 'galery' },
			// The same identifier, for a profile: not a file of the article.
			{ fichier: 33, entree: 1, type: TYPE_PROFIL, champ: 'image_gallery' },
		]

		const { attendus, photosNonReprises } = articlesAttendus(
			[article(1)],
			liens,
			new Map([
				[30, 300],
				[31, 310],
				[33, 330],
			])
		)

		expect(attendus[0]?.valeurs.gallery).toEqual([310, 300])
		expect(photosNonReprises).toEqual([{ entree: 1, fichier: 32 }])
	})

	test('un slug qui n’est pas une adresse, ou en double, est refusé et listé ; jamais corrigé', () => {
		const { pris, refuses } = articlesRepartis([
			article(3, { slug: 'article-1' }),
			article(1),
			article(2, { slug: 'Article Deux' }),
			article(4, { slug: null }),
		])

		expect(pris.map(({ id }) => id)).toEqual([1])
		expect(refuses).toEqual([
			{ strapiId: 2, motif: 'slug-pas-une-adresse', champs: ['slug'] },
			{ strapiId: 3, motif: 'slug-en-double', champs: ['slug'] },
			{ strapiId: 4, motif: 'slug-pas-une-adresse', champs: ['slug'] },
		])
	})
})
