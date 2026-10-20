import { describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { z } from 'zod'
import { donneesStructureesDeLArticle, donneesStructureesDuFilDAriane, serializeJsonLd } from '@/lib/seo/json-ld'
import { descriptionEditoriale, texteBrut } from '@/lib/seo/text'
import { ARTICLE_FIELDS, readPublicArticle } from '@/services/public/articles'

/**
 * The page of an article without a database (ticket 106): what its reading asks for, the structured
 * data (E65, checked against a schema), and the description the newsroom writes. The runs against the
 * bench: tests/e2e/blog-article.spec.ts.
 */

/** A Payload that records the reads it is given and answers the documents it was built with. */
function payloadEspion(docs: Record<string, unknown>[]) {
	const lectures: Record<string, unknown>[] = []
	const payload = {
		find: async (options: Record<string, unknown>) => {
			lectures.push(options)
			return { docs }
		},
	} as unknown as Payload
	return { payload, lectures }
}

const ARTICLE = {
	slug: 'un-article-fictif',
	title: ' Un article fictif ',
	author: null,
	excerpt: undefined,
	seo_title: null,
	seo_description: 'null',
	content: null,
	publishedAt: null,
	createdAt: '2026-01-02T10:00:00.000Z',
	updatedAt: '2026-03-04T10:00:00.000Z',
}

describe('lireUnArticlePublic : la lecture publique d’un article', () => {
	test('elle choisit ses champs, garde les règles d’accès et se borne à un document', async () => {
		const { payload, lectures } = payloadEspion([ARTICLE])
		await readPublicArticle(payload, 'un-article-fictif')
		expect(lectures).toHaveLength(1)
		expect(lectures[0]).toMatchObject({
			collection: 'articles',
			where: { slug: { equals: 'un-article-fictif' } },
			select: ARTICLE_FIELDS,
			overrideAccess: false,
			limit: 1,
			depth: 0,
		})
	})

	test('les champs lus sont figés : ni identifiant de l’ancien site, ni galerie, ni état de brouillon', () => {
		expect(Object.keys(ARTICLE_FIELDS).sort()).toEqual(
			[
				'author',
				'content',
				'createdAt',
				'excerpt',
				'publishedAt',
				'seo_description',
				'seo_title',
				'slug',
				'title',
				'updatedAt',
			].sort()
		)
	})

	test('un champ jamais rempli est une chaîne vide, jamais « null » ; la date de création sert de publication', async () => {
		const { payload } = payloadEspion([ARTICLE])
		const article = await readPublicArticle(payload, 'un-article-fictif')
		expect(article).toEqual({
			slug: 'un-article-fictif',
			titre: 'Un article fictif',
			auteur: '',
			extrait: '',
			titreSeo: '',
			descriptionSeo: '',
			contenu: '',
			publieLe: '2026-01-02T10:00:00.000Z',
			modifieLe: '2026-03-04T10:00:00.000Z',
		})
	})

	test('un brouillon ou un inconnu (rien rendu par la base) : null', async () => {
		const { payload } = payloadEspion([])
		expect(await readPublicArticle(payload, 'inconnu')).toBeNull()
	})

	test('une adresse qui n’est pas un slug ne touche pas la base', async () => {
		const { payload, lectures } = payloadEspion([ARTICLE])
		for (const mauvais of ['', 'Un Article', '../etc', 'a b', 'a'.repeat(300)])
			expect(await readPublicArticle(payload, mauvais)).toBeNull()
		expect(lectures).toHaveLength(0)
	})
})

const SCHEMA_FIL = z.object({
	'@context': z.literal('https://schema.org'),
	'@type': z.literal('BreadcrumbList'),
	itemListElement: z
		.array(
			z.object({
				'@type': z.literal('ListItem'),
				position: z.number().int().positive(),
				name: z.string().min(1),
				item: z.url(),
			})
		)
		.min(2),
})

const SCHEMA_ARTICLE = z.object({
	'@context': z.literal('https://schema.org'),
	'@type': z.literal('Article'),
	headline: z.string().min(1).max(110),
	description: z.string().min(1),
	inLanguage: z.literal('fr-FR'),
	datePublished: z.iso.datetime(),
	dateModified: z.iso.datetime(),
	mainEntityOfPage: z.object({ '@type': z.literal('WebPage'), '@id': z.url() }),
	author: z.object({ '@type': z.enum(['Person', 'Organization']), name: z.string().min(1) }).loose(),
	publisher: z.object({ '@type': z.literal('Organization'), name: z.string().min(1), logo: z.url() }).loose(),
})

describe('E65 : les données structurées d’un article', () => {
	const entrees = {
		titre: 'Un article fictif',
		description: 'Une description écrite pour l’essai.',
		url: 'https://my-makeup.fr/blog/un-article-fictif',
		auteur: 'Une rédactrice fictive',
		publieLe: '2026-01-02T10:00:00.000Z',
		modifieLe: '2026-03-04T10:00:00.000Z',
	}

	test('Article est valide, et dit ce que la page dit', () => {
		const donnees = SCHEMA_ARTICLE.parse(donneesStructureesDeLArticle(entrees))
		expect(donnees.headline).toBe('Un article fictif')
		expect(donnees.mainEntityOfPage['@id']).toBe(entrees.url)
		expect(donnees.author.name).toBe('Une rédactrice fictive')
	})

	test('sans signature, l’éditeur du site est l’auteur : jamais un auteur vide', () => {
		const donnees = SCHEMA_ARTICLE.parse(donneesStructureesDeLArticle({ ...entrees, auteur: '' }))
		expect(donnees.author['@type']).toBe('Organization')
		expect(donnees.author.name).toBe('My-Makeup')
	})

	test('le fil d’Ariane est valide, numéroté de 1, et finit sur la page', () => {
		const donnees = SCHEMA_FIL.parse(
			donneesStructureesDuFilDAriane([
				{ nom: 'Accueil', url: 'https://my-makeup.fr' },
				{ nom: 'Blog', url: 'https://my-makeup.fr/blog' },
				{ nom: 'Un article fictif', url: entrees.url },
			])
		)
		expect(donnees.itemListElement.map(({ position }) => position)).toEqual([1, 2, 3])
		expect(donnees.itemListElement.at(-1)?.item).toBe(entrees.url)
	})

	test('un titre qui contient « </script> » ne ferme pas la balise', () => {
		const sortie = serializeJsonLd(donneesStructureesDeLArticle({ ...entrees, titre: '</script><script>x()</script>' }))
		expect(sortie).not.toContain('</script>')
		expect(JSON.parse(sortie).headline).toBe('</script><script>x()</script>')
	})
})

describe('descriptionEditoriale : le texte que la rédaction a écrit est gardé', () => {
	const repli = 'Un texte de repli écrit pour atteindre soixante-dix caractères au moins, comme le veut la règle.'

	test('un texte court de la rédaction est gardé tel quel', () => {
		expect(descriptionEditoriale('Court mais écrit.', ['x'.repeat(200)], repli)).toBe('Court mais écrit.')
	})

	test('coupé à 155 caractères', () => {
		expect(descriptionEditoriale('mot '.repeat(80), [], repli).length).toBeLessThanOrEqual(155)
	})

	test('sans texte de la rédaction, le premier texte de 70 caractères ou plus, markdown réduit en texte', () => {
		const contenu = `# Titre\n\n**Gras** et [un lien](https://example.test) ${'avec du texte '.repeat(8)}`
		const sortie = descriptionEditoriale(null, ['court', contenu], repli)
		expect(sortie).toStartWith('Titre Gras et un lien avec du texte')
		expect(sortie).not.toMatch(/[#*[\]()]|https/)
	})

	test('rien d’écrit nulle part : le repli', () => {
		expect(descriptionEditoriale(null, [undefined, 'court'], repli)).toBe(repli)
	})

	test('texteBrut ne laisse ni balise, ni « null »', () => {
		expect(texteBrut('<b>a</b> null ![img](x.webp) b')).toBe('a img b')
	})
})
