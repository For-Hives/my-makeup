import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { SQL } from 'bun'
import { TYPE_ARTICLE } from '../../scripts/migration/import/media'
import type { Report } from '../../scripts/migration/import/report'
import type { Article, Media } from '../../src/payload-types'
import { importerSurLeBanc } from '../outils/import'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { deposerUnObjet, supprimerUnObjet, viderLeStockage } from '../outils/s3'
import { creerLaSourceStrapi, effacerLaSourceStrapi, sourceDuBanc } from '../outils/source-strapi'
import { definitionDeLaSource } from '../outils/source-strapi/donnees'
import { pngUni } from '../outils/source-strapi/images'

/**
 * Ticket 061: the articles are taken as they are, drafts included (docs/migration/SCHEMA.md §5.3;
 * plan 02 §7.3, I39 and I40). The fake source holds two published articles and no file of an
 * article, as the real base on 13/10/2026: this file adds, as the owner of the bench, a draft with
 * a long markdown, an image in the gallery of article 1 and a PDF in the gallery of article 7, the
 * cases the source does not carry (docs/tests/source-strapi.md, « Ce que la source ne porte pas »).
 *
 * One import for the whole file.
 */

const source = sourceDuBanc()
const { lignes } = definitionDeLaSource(source.medias)

const BROUILLON = 12
const IMAGE = 120
const PDF = 121
const CLE_DE_L_IMAGE = '1/image_article_fictive_0a1b2c3d4e.png'

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
async function avecLeProprietaire<T>(travail: (sql: SQL) => Promise<T>): Promise<T> {
	const proprietaire = new SQL({ url: source.administration, max: 1 })
	try {
		return await travail(proprietaire)
	} finally {
		await proprietaire.close()
	}
}

/** The articles of the source, the draft this file adds included. */
const ARTICLES_DE_LA_SOURCE = [
	...lignes.articles,
	{
		id: BROUILLON,
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

const enIso = (horodatage: unknown): string | null =>
	horodatage === null ? null : `${String(horodatage).replace(' ', 'T')}Z`

async function articlesDeLaCible(): Promise<Article[]> {
	const payload = await payloadDeTest()
	const { docs } = await payload.find({
		collection: 'articles',
		depth: 0,
		pagination: false,
		overrideAccess: true,
		sort: 'strapiId',
	})
	return docs
}

let premier: Report

beforeAll(async () => {
	await viderLaBase()
	// Before the source: emptying the bucket would take its objects away.
	await viderLeStockage()
	await creerLaSourceStrapi()
	await deposerUnObjet(CLE_DE_L_IMAGE, pngUni(32, 24, { rouge: 200, vert: 120, bleu: 160 }), { type: 'image/png' })
	await avecLeProprietaire(async sql => {
		await sql`INSERT INTO articles (id, title, content, author, seo_title, seo_description, slug, excerpt,
			created_at, updated_at, published_at)
			VALUES (${BROUILLON}, 'Un brouillon fictif', ${MARKDOWN}, 'La rédaction', 'Un brouillon fictif',
			'Une description fictive.', 'un-brouillon-fictif', NULL, '2026-10-10 08:00:00', '2026-10-11 09:30:00', NULL)`
		await sql.unsafe(
			`INSERT INTO files (id, name, width, height, hash, ext, mime, size, url, created_at, updated_at)
			VALUES (${IMAGE}, 'image-article.png', 32, 24, 'image_article_fictive_0a1b2c3d4e', '.png', 'image/png', 0.2,
				'${source.medias}/${CLE_DE_L_IMAGE}', '2026-10-09 00:40:00', '2026-10-09 00:40:00'),
			(${PDF}, 'fiche.pdf', NULL, NULL, 'fiche_fictive_9f8e7d6c5b', '.pdf', 'application/pdf', 1.1,
				'${source.medias}/1/fiche_fictive_9f8e7d6c5b.pdf', '2026-10-09 00:41:00', '2026-10-09 00:41:00')`
		)
		await sql.unsafe(
			`INSERT INTO files_related_morphs (id, file_id, related_id, related_type, field, "order")
			VALUES (900, ${IMAGE}, 1, '${TYPE_ARTICLE}', 'galery', 1), (901, ${PDF}, 7, '${TYPE_ARTICLE}', 'galery', 1)`
		)
	})
	premier = await importerSurLeBanc()
}, 60_000)

afterAll(async () => {
	await viderLaBase()
	await effacerLaSourceStrapi()
	await supprimerUnObjet(CLE_DE_L_IMAGE)
})

describe('Les articles sont repris à l’identique, brouillons compris (ticket 061)', () => {
	test('autant d’articles qu’à la source, le même slug, le markdown égal à l’octet près (I39, I40)', async () => {
		const cible = await articlesDeLaCible()

		expect(cible.map(({ strapiId }) => strapiId)).toEqual([1, 7, BROUILLON])
		expect(premier.collections.articles).toMatchObject({ source: 3, created: 3, updated: 0, refused: [] })
		expect(premier.parity?.articles).toMatchObject({ expected: 3, equal: 3, different: [], missing: [], extra: [] })
		const octets = (texte: unknown) => Buffer.from(String(texte), 'utf8')
		for (const article of cible) {
			const ligne = ARTICLES_DE_LA_SOURCE.find(({ id }) => id === article.strapiId)
			expect(article, String(article.strapiId)).toMatchObject({
				title: ligne?.title,
				slug: ligne?.slug,
				author: ligne?.author,
				excerpt: ligne?.excerpt ?? null,
				seo_title: ligne?.seo_title,
				seo_description: ligne?.seo_description,
			})
			expect(octets(article.content).equals(octets(ligne?.content)), String(article.strapiId)).toBe(true)
		}
		expect(cible.find(({ strapiId }) => strapiId === BROUILLON)?.content?.length).toBeGreaterThan(60_000)
	})

	test('l’état publié ou brouillon et la date de publication sont conservés, et les dates d’origine', async () => {
		for (const article of await articlesDeLaCible()) {
			const ligne = ARTICLES_DE_LA_SOURCE.find(({ id }) => id === article.strapiId)
			expect(article, String(article.strapiId)).toMatchObject({
				_status: ligne?.published_at === null ? 'draft' : 'published',
				publishedAt: enIso(ligne?.published_at ?? null),
				createdAt: enIso(ligne?.created_at),
				updatedAt: enIso(ligne?.updated_at),
			})
		}
		const brouillon = (await articlesDeLaCible()).find(({ strapiId }) => strapiId === BROUILLON)
		expect([brouillon?._status, brouillon?.publishedAt]).toEqual(['draft', null])
	})

	test('une image de galerie est rattachée si son média est adopté ; un PDF est signalé, pas inventé', async () => {
		const payload = await payloadDeTest()
		const cible = await articlesDeLaCible()
		const { docs: medias } = await payload.find({
			collection: 'media',
			depth: 0,
			pagination: false,
			where: { strapiId: { in: [IMAGE, PDF] } },
		})
		const image = medias.find(({ strapiId }) => strapiId === IMAGE) as Media | undefined

		expect(medias.map(({ strapiId }) => strapiId)).toEqual([IMAGE])
		expect(image).toMatchObject({ owner: null, mimeType: 'image/png', url: `${source.medias}/${CLE_DE_L_IMAGE}` })
		expect(cible.find(({ strapiId }) => strapiId === 1)?.gallery).toEqual([image?.id ?? -1])
		expect(cible.find(({ strapiId }) => strapiId === 7)?.gallery ?? []).toEqual([])
		expect(premier.collections.articles?.photosNotCarriedOver).toEqual([{ entry: 7, file: PDF }])
		expect(premier.collections.media?.files?.notAdopted).toContainEqual({ file: PDF, reason: 'pas-une-image' })
	})

	test('second passage : 0 création, 0 mise à jour', async () => {
		const avant = await articlesDeLaCible()

		const second = await importerSurLeBanc()

		expect(second.collections.articles).toMatchObject({ created: 0, updated: 0, unchanged: 3, refused: [] })
		expect(await articlesDeLaCible()).toEqual(avant)
	})
})
