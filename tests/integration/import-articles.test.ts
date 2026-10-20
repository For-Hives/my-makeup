import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { SQL } from 'bun'
import { TYPE_ARTICLE } from '../../scripts/migration/import/media'
import type { Report } from '../../scripts/migration/import/report'
import type { Article, Media } from '../../src/payload-types'
import { importOnBench } from '../support/import'
import { emptyBase, testPayload } from '../support/payload-test'
import { deleteObject, dropObject, emptyStorage } from '../support/s3'
import { benchSource, createSourceStrapi, eraseSourceStrapi } from '../support/source-strapi'
import { sourceDefinition } from '../support/source-strapi/data'
import { pngPlain } from '../support/source-strapi/images'

/**
 * Ticket 061: the articles are taken as they are, drafts included (docs/migration/SCHEMA.md §5.3;
 * plan 02 §7.3, I39 and I40). The fake source holds two published articles and no file of an
 * article, as the real base on 13/10/2026: this file adds, as the owner of the bench, a draft with
 * a long markdown, an image in the gallery of article 1 and a PDF in the gallery of article 7, the
 * cases the source does not carry (docs/tests/source-strapi.md, « Ce que la source ne porte pas »).
 *
 * One import for the whole file.
 */

const source = benchSource()
const { lignes: lines } = sourceDefinition(source.medias)

const DRAFT = 12
const IMAGE = 120
const PDF = 121
const IMAGE_KEY = '1/image_article_fictive_0a1b2c3d4e.png'

/**
 * A markdown of more than 60 000 characters that a careless copy would change: line ends of both
 * kinds, tabs, spaces at the end of a line, characters outside the basic plane, a combining accent,
 * HTML written as text.
 */
const MARKDOWN = [
	'# Un brouillon fictif\r\n',
	'Une ligne qui finit par deux espaces  \n',
	'\tUne ligne en retrait.\n',
	'Un « e » suivi d’un accent combinant : é.\n',
	'Des emojis : 💄✨, et du HTML écrit en texte : <script>alert(1)</script>\n',
	'| a | b |\n|---|---|\n| 1 | 2 |\n',
	'Paragraphe de remplissage, sans donnée réelle. '.repeat(1_400),
	'\n\nFin.\n\n',
].join('')

/** As the owner of the bench, the only one who may write into the source. */
async function withOwner<T>(travail: (sql: SQL) => Promise<T>): Promise<T> {
	const owner = new SQL({ url: source.administration, max: 1 })
	try {
		return await travail(owner)
	} finally {
		await owner.close()
	}
}

/** The articles of the source, the draft this file adds included. */
const SOURCE_ARTICLES = [
	...lines.articles,
	{
		id: DRAFT,
		title: 'Un brouillon fictif',
		content: MARKDOWN,
		author: 'La rédaction',
		seo_title: 'Un brouillon fictif',
		seo_description: 'Une description fictive.',
		slug: 'un-brouillon-fictif',
		excerpt: null,
		created_at: '2026-10-10 08:00:00.000',
		updated_at: '2026-10-11 09:30:00.000',
		published_at: null,
	},
]

const inIso = (horodatage: unknown): string | null =>
	horodatage === null ? null : `${String(horodatage).replace(' ', 'T')}Z`

async function targetArticles(): Promise<Article[]> {
	const payload = await testPayload()
	const { docs } = await payload.find({
		collection: 'articles',
		depth: 0,
		pagination: false,
		overrideAccess: true,
		sort: 'strapiId',
	})
	return docs
}

let first: Report

beforeAll(async () => {
	await emptyBase()
	// Before the source: emptying the bucket would take its objects away.
	await emptyStorage()
	await createSourceStrapi()
	await dropObject(IMAGE_KEY, pngPlain(32, 24, { rouge: 200, vert: 120, bleu: 160 }), { type: 'image/png' })
	await withOwner(async sql => {
		await sql`INSERT INTO articles (id, title, content, author, seo_title, seo_description, slug, excerpt,
			created_at, updated_at, published_at)
			VALUES (${DRAFT}, 'Un brouillon fictif', ${MARKDOWN}, 'La rédaction', 'Un brouillon fictif',
			'Une description fictive.', 'un-brouillon-fictif', NULL, '2026-10-10 08:00:00', '2026-10-11 09:30:00', NULL)`
		await sql.unsafe(
			`INSERT INTO files (id, name, width, height, hash, ext, mime, size, url, created_at, updated_at)
			VALUES (${IMAGE}, 'image-article.png', 32, 24, 'image_article_fictive_0a1b2c3d4e', '.png', 'image/png', 0.2,
				'${source.medias}/${IMAGE_KEY}', '2026-10-09 00:40:00', '2026-10-09 00:40:00'),
			(${PDF}, 'fiche.pdf', NULL, NULL, 'fiche_fictive_9f8e7d6c5b', '.pdf', 'application/pdf', 1.1,
				'${source.medias}/1/fiche_fictive_9f8e7d6c5b.pdf', '2026-10-09 00:41:00', '2026-10-09 00:41:00')`
		)
		await sql.unsafe(
			`INSERT INTO files_related_morphs (id, file_id, related_id, related_type, field, "order")
			VALUES (900, ${IMAGE}, 1, '${TYPE_ARTICLE}', 'galery', 1), (901, ${PDF}, 7, '${TYPE_ARTICLE}', 'galery', 1)`
		)
	})
	first = await importOnBench()
}, 60_000)

afterAll(async () => {
	await emptyBase()
	await eraseSourceStrapi()
	await deleteObject(IMAGE_KEY)
})

describe('Les articles sont repris à l’identique, brouillons compris (ticket 061)', () => {
	test('autant d’articles qu’à la source, le même slug, le markdown égal à l’octet près (I39, I40)', async () => {
		const target = await targetArticles()

		expect(target.map(({ strapiId }) => strapiId)).toEqual([1, 7, DRAFT])
		expect(first.collections.articles).toMatchObject({ source: 3, created: 3, updated: 0, refused: [] })
		expect(first.parity?.articles).toMatchObject({ expected: 3, equal: 3, different: [], missing: [], extra: [] })
		const bytes = (texte: unknown) => Buffer.from(String(texte), 'utf8')
		for (const article of target) {
			const line = SOURCE_ARTICLES.find(({ id }) => id === article.strapiId)
			expect(article, String(article.strapiId)).toMatchObject({
				title: line?.title,
				slug: line?.slug,
				author: line?.author,
				excerpt: line?.excerpt ?? null,
				seo_title: line?.seo_title,
				seo_description: line?.seo_description,
			})
			expect(bytes(article.content).equals(bytes(line?.content)), String(article.strapiId)).toBe(true)
		}
		expect(target.find(({ strapiId }) => strapiId === DRAFT)?.content?.length).toBeGreaterThan(60_000)
	})

	test('l’état publié ou brouillon et la date de publication sont conservés, et les dates d’origine', async () => {
		for (const article of await targetArticles()) {
			const line = SOURCE_ARTICLES.find(({ id }) => id === article.strapiId)
			expect(article, String(article.strapiId)).toMatchObject({
				_status: line?.published_at === null ? 'draft' : 'published',
				publishedAt: inIso(line?.published_at ?? null),
				createdAt: inIso(line?.created_at),
				updatedAt: inIso(line?.updated_at),
			})
		}
		const draft = (await targetArticles()).find(({ strapiId }) => strapiId === DRAFT)
		expect([draft?._status, draft?.publishedAt]).toEqual(['draft', null])
	})

	test('une image de galerie est rattachée si son média est adopté ; un PDF est signalé, pas inventé', async () => {
		const payload = await testPayload()
		const target = await targetArticles()
		const { docs: media } = await payload.find({
			collection: 'media',
			depth: 0,
			pagination: false,
			where: { strapiId: { in: [IMAGE, PDF] } },
		})
		const image = media.find(({ strapiId }) => strapiId === IMAGE) as Media | undefined

		expect(media.map(({ strapiId }) => strapiId)).toEqual([IMAGE])
		expect(image).toMatchObject({ owner: null, mimeType: 'image/png', url: `${source.medias}/${IMAGE_KEY}` })
		expect(target.find(({ strapiId }) => strapiId === 1)?.gallery).toEqual([image?.id ?? -1])
		expect(target.find(({ strapiId }) => strapiId === 7)?.gallery ?? []).toEqual([])
		expect(first.collections.articles?.photosNotCarriedOver).toEqual([{ entry: 7, file: PDF }])
		expect(first.collections.media?.files?.notAdopted).toContainEqual({ file: PDF, reason: 'pas-une-image' })
	})

	test('second passage : 0 création, 0 mise à jour', async () => {
		const before = await targetArticles()

		const second = await importOnBench()

		expect(second.collections.articles).toMatchObject({ created: 0, updated: 0, unchanged: 3, refused: [] })
		expect(await targetArticles()).toEqual(before)
	})
})
