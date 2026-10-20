import { afterEach, describe, expect, test } from 'bun:test'
import { listArticles } from '@/services/public/article-list'
import { emptyBase, testPayload } from '../support/payload-test'

/**
 * The list of the blog on the bench (ticket 107): the published articles, the most recent first,
 * never a draft, and nothing a visitor may not read.
 */

afterEach(emptyBase)

async function ecrire(slug: string, donnees: Record<string, unknown> = {}) {
	const payload = await testPayload()
	return payload.create({
		collection: 'articles',
		data: { title: `Article ${slug}`, slug, excerpt: `Extrait ${slug}`, _status: 'published', ...donnees },
	})
}

describe('Liste des articles publiés', () => {
	test('les publiés seulement, du plus récent au plus ancien', async () => {
		await ecrire('ancien', { publishedAt: '2026-01-10T09:00:00.000Z' })
		await ecrire('recent', { publishedAt: '2026-10-10T09:00:00.000Z' })
		await ecrire('milieu', { publishedAt: '2026-05-10T09:00:00.000Z' })
		await ecrire('brouillon', { _status: 'draft', publishedAt: '2026-10-12T09:00:00.000Z' })

		const liste = await listArticles(await testPayload())

		expect(liste.map(({ slug }) => slug)).toEqual(['recent', 'milieu', 'ancien'])
		expect(liste[0]).toEqual({
			slug: 'recent',
			titre: 'Article recent',
			extrait: 'Extrait recent',
			publieLe: '2026-10-10T09:00:00.000Z',
		})
	})

	test('un article publié sans date vient après les datés, et la liste vide est vide', async () => {
		expect(await listArticles(await testPayload())).toEqual([])
		const payload = await testPayload()
		await ecrire('date', { publishedAt: '2026-03-01T09:00:00.000Z' })
		// The import may leave the date empty: the newsroom hook only fills it at a publication.
		const sans = await ecrire('sans-date')
		await payload.db.updateOne({ collection: 'articles', id: sans.id, data: { publishedAt: null }, returning: false })

		const liste = await listArticles(payload)

		expect(liste.map(({ slug }) => slug)).toEqual(['date', 'sans-date'])
	})

	test('un brouillon en cours sur un article publié ne change pas la liste', async () => {
		const publie = await ecrire('publie', { publishedAt: '2026-04-01T09:00:00.000Z' })
		const payload = await testPayload()
		await payload.update({ collection: 'articles', id: publie.id, draft: true, data: { title: 'Titre en cours' } })

		const liste = await listArticles(payload)

		expect(liste.map(({ titre }) => titre)).toEqual(['Article publie'])
	})
})
