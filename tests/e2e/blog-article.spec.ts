import { expect, type Page, test } from '@playwright/test'
import { createContent, deleteContent } from '../support/public-pages'

/**
 * The page of an article of the blog, end to end (ticket 106; plan 02 E59 and E65): 200 with one h1 for a
 * published article, the markdown sanitized and its titles lowered, the structured data, and a 404 in
 * French for a draft or an unknown slug. The articles are made up and taken away at the end.
 */

const suffix = Date.now().toString(36)
const published = `essai-article-${suffix}`
const draft = `essai-article-brouillon-${suffix}`
const bare = `essai-article-nu-${suffix}`
const long = `essai-article-long-${suffix}`

const CONTENT = [
	'# Un titre du texte',
	'',
	'Un paragraphe avec du **gras**.',
	'',
	'## Une partie',
	'',
	'<script>window.__glisse = true</script>',
	'',
	'[un lien piégé](javascript:window.__glisse=true)',
	'',
	'<img src="https://photos.example.test/a.webp" onerror="window.__glisse = true">',
].join('\n')

/** About 1 300 words under four titles: long enough for the table of contents. */
const LONG_CONTENT = [
	'Un début.',
	...['Première', 'Deuxième', 'Troisième', 'Quatrième'].map(
		part => `## Partie ${part}\n\n${'Un texte fictif de l’essai, assez long pour compter. '.repeat(32)}`
	),
].join('\n\n')

const identifiers: { collection: 'articles'; id: number }[] = []

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request }) => {
	identifiers.push(
		{
			collection: 'articles',
			id: await createContent(request, 'articles', {
				title: `Article d’essai ${suffix}`,
				slug: published,
				author: 'Une rédactrice fictive',
				seo_description: 'Une description écrite pour l’essai de la page d’un article.',
				content: CONTENT,
				_status: 'published',
			}),
		},
		{
			collection: 'articles',
			id: await createContent(request, 'articles', {
				title: 'Brouillon',
				slug: draft,
				content: 'x',
				_status: 'draft',
			}),
		},
		{
			collection: 'articles',
			id: await createContent(request, 'articles', { title: `Article nu ${suffix}`, slug: bare, _status: 'published' }),
		},
		{
			collection: 'articles',
			id: await createContent(request, 'articles', {
				title: `Article long ${suffix}`,
				slug: long,
				content: LONG_CONTENT,
				_status: 'published',
			}),
		}
	)
})

test.afterAll(async ({ request }) => {
	for (const { collection, id } of identifiers) await deleteContent(request, collection, id)
})

/** The structured data blocks of a page, parsed. */
async function structuredData(page: Page): Promise<Record<string, unknown>[]> {
	const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
	return blocks.map(bloc => JSON.parse(bloc) as Record<string, unknown>)
}

test.describe('E59 et E65 : l’article du blog', { tag: '@mobile' }, () => {
	test('@smoke un article publié répond 200 avec un seul h1, son titre', async ({ page }) => {
		const response = await page.goto(`/blog/${published}`)
		expect(response?.status()).toBe(200)
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Article d’essai ${suffix}`)
		// « # » of the text is an h2, « ## » too: nothing takes the place of the title.
		await expect(page.getByRole('heading', { level: 2, name: 'Un titre du texte' })).toBeVisible()
		await expect(page.getByText('Par Une rédactrice fictive')).toBeVisible()
		await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()
	})

	test('le HTML du serveur : un seul h1, aucun script glissé, aucun gestionnaire, aucun « null »', async ({
		request,
	}) => {
		const html = await (await request.get(`/blog/${published}`)).text()
		expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
		expect(html).not.toContain('__glisse = true</script>')
		expect(html).not.toMatch(/onerror|javascript:window/)
		expect(html).toContain('Un paragraphe avec du <strong>gras</strong>')
		expect(html).toContain('<link rel="canonical" href="https://my-makeup.fr/blog/')
		expect(html).toContain('Une description écrite pour l’essai de la page d’un article.')
	})

	test('rien d’exécuté dans le navigateur : la page ne pose pas la marque du script glissé', async ({ page }) => {
		await page.goto(`/blog/${published}`)
		expect(await page.evaluate(() => (window as unknown as { __glisse?: boolean }).__glisse)).toBeUndefined()
	})

	test('E65 : Article et fil d’Ariane, cohérents avec la page', async ({ page }) => {
		await page.goto(`/blog/${published}`)
		const blocks = await structuredData(page)
		const article = blocks.find(bloc => bloc['@type'] === 'Article')
		const thread = blocks.find(bloc => bloc['@type'] === 'BreadcrumbList') as
			| { itemListElement: { position: number; name: string; item: string }[] }
			| undefined
		expect(article).toMatchObject({
			headline: `Article d’essai ${suffix}`,
			inLanguage: 'fr-FR',
			author: { name: 'Une rédactrice fictive' },
			mainEntityOfPage: { '@id': `https://my-makeup.fr/blog/${published}` },
		})
		expect(thread?.itemListElement.map(({ position, name }) => [position, name])).toEqual([
			[1, 'Accueil'],
			[2, 'Blog'],
			[3, `Article d’essai ${suffix}`],
		])
		expect(thread?.itemListElement.at(-1)?.item).toBe(`https://my-makeup.fr/blog/${published}`)
	})

	test('un article sans contenu ni signature : 200, un h1, jamais « null » ni « undefined »', async ({
		page,
		request,
	}) => {
		const response = await page.goto(`/blog/${bare}`)
		expect(response?.status()).toBe(200)
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
		const text = await page.locator('main').innerText()
		expect(text).not.toMatch(/\b(?:null|undefined)\b/)
		expect(text).not.toContain('Auteur.e')
		await expect(page.getByTestId('auteur')).toHaveCount(0)
		expect((await request.get(`/blog/${bare}`)).status()).toBe(200)
	})

	test('E59 : un brouillon et un inconnu répondent 404 en français, dans le gabarit', async ({ page, request }) => {
		for (const slug of [draft, `inexistant-${suffix}`, 'Mauvais_Slug']) {
			const response = await page.goto(`/blog/${slug}`)
			expect(response?.status(), slug).toBe(404)
			await expect(page.getByRole('heading', { level: 1, name: '404 - Page non trouvée' })).toBeVisible()
			await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()
			// Without a browser, as a robot reads it: the status.
			expect((await request.get(`/blog/${slug}`)).status(), slug).toBe(404)
		}
	})

	test('issue 1103 : colonne de lecture, titre en Bodoni, temps de lecture, partage et articles liés', async ({
		page,
	}) => {
		await page.goto(`/blog/${published}`)
		const body = page.getByTestId('article-body')
		const metrics = await body.evaluate(element => {
			const style = getComputedStyle(element)
			return {
				width: element.getBoundingClientRect().width,
				size: parseFloat(style.fontSize),
				line: parseFloat(style.lineHeight),
			}
		})
		// about 65 characters at 18-20 px: never wider than 700 px, and a line height of 1.7.
		expect(metrics.width).toBeLessThanOrEqual(700)
		expect(metrics.size).toBeGreaterThanOrEqual(18)
		expect(Math.round((metrics.line / metrics.size) * 10) / 10).toBe(1.7)
		expect(await page.getByRole('heading', { level: 1 }).evaluate(h1 => getComputedStyle(h1).fontFamily)).toMatch(
			/bodoni/i
		)
		await expect(page.getByTestId('temps-de-lecture')).toHaveText(/^\d+ min de lecture$/)
		// A short article has no table of contents.
		await expect(page.getByTestId('sommaire')).toHaveCount(0)
		const share = page.getByTestId('partage')
		await expect(share.getByRole('link', { name: '← Tous les articles' })).toHaveAttribute('href', '/blog')
		await expect(share.getByRole('link', { name: /LinkedIn/ })).toHaveAttribute('rel', 'noopener noreferrer')
		// The other articles, never the one being read.
		const related = page.getByTestId('articles-lies')
		await expect(related.getByRole('heading', { level: 2, name: 'À lire aussi' })).toBeVisible()
		await expect(related.locator(`a[href="/blog/${published}"]`)).toHaveCount(0)
		// Three at most, the most recent others (other articles are made in parallel: which ones is not asked).
		expect(await related.locator('li').count()).toBeGreaterThanOrEqual(1)
		expect(await related.locator('li').count()).toBeLessThanOrEqual(3)
	})

	test('issue 1103 : un article long a son sommaire, dont chaque lien mène à un titre', async ({ page }) => {
		await page.goto(`/blog/${long}`)
		const links = page.getByTestId('sommaire').getByRole('link')
		await expect(links).toHaveCount(4)
		for (const href of await links.evaluateAll(anchors => anchors.map(anchor => anchor.getAttribute('href') ?? ''))) {
			expect(href).toMatch(/^#section-/)
			await expect(page.locator(href)).toHaveCount(1)
		}
	})

	test('il n’y a pas de débordement horizontal', async ({ page }) => {
		await page.goto(`/blog/${published}`)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
	})
})
