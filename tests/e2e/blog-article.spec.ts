import { expect, type Page, test } from '@playwright/test'
import { creerContenu, supprimerContenu } from '../outils/pages-publiques'

/**
 * The page of an article of the blog, end to end (ticket 106; plan 02 E59 and E65): 200 with one h1 for a
 * published article, the markdown sanitized and its titles lowered, the structured data, and a 404 in
 * French for a draft or an unknown slug. The articles are made up and taken away at the end.
 */

const suffixe = Date.now().toString(36)
const publie = `essai-article-${suffixe}`
const brouillon = `essai-article-brouillon-${suffixe}`
const nu = `essai-article-nu-${suffixe}`

const CONTENU = [
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

const identifiants: { collection: 'articles'; id: number }[] = []

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request }) => {
	identifiants.push(
		{
			collection: 'articles',
			id: await creerContenu(request, 'articles', {
				title: `Article d’essai ${suffixe}`,
				slug: publie,
				author: 'Une rédactrice fictive',
				seo_description: 'Une description écrite pour l’essai de la page d’un article.',
				content: CONTENU,
				_status: 'published',
			}),
		},
		{
			collection: 'articles',
			id: await creerContenu(request, 'articles', {
				title: 'Brouillon',
				slug: brouillon,
				content: 'x',
				_status: 'draft',
			}),
		},
		{
			collection: 'articles',
			id: await creerContenu(request, 'articles', { title: `Article nu ${suffixe}`, slug: nu, _status: 'published' }),
		}
	)
})

test.afterAll(async ({ request }) => {
	for (const { collection, id } of identifiants) await supprimerContenu(request, collection, id)
})

/** The structured data blocks of a page, parsed. */
async function donneesStructurees(page: Page): Promise<Record<string, unknown>[]> {
	const blocs = await page.locator('script[type="application/ld+json"]').allTextContents()
	return blocs.map(bloc => JSON.parse(bloc) as Record<string, unknown>)
}

test.describe('E59 et E65 : l’article du blog', { tag: '@mobile' }, () => {
	test('@smoke un article publié répond 200 avec un seul h1, son titre', async ({ page }) => {
		const reponse = await page.goto(`/blog/${publie}`)
		expect(reponse?.status()).toBe(200)
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Article d’essai ${suffixe}`)
		// « # » of the text is an h2, « ## » too: nothing takes the place of the title.
		await expect(page.getByRole('heading', { level: 2, name: 'Un titre du texte' })).toBeVisible()
		await expect(page.getByText('Auteur.e : Une rédactrice fictive')).toBeVisible()
		await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()
	})

	test('le HTML du serveur : un seul h1, aucun script glissé, aucun gestionnaire, aucun « null »', async ({
		request,
	}) => {
		const html = await (await request.get(`/blog/${publie}`)).text()
		expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
		expect(html).not.toContain('__glisse = true</script>')
		expect(html).not.toMatch(/onerror|javascript:window/)
		expect(html).toContain('Un paragraphe avec du <strong>gras</strong>')
		expect(html).toContain('<link rel="canonical" href="https://my-makeup.fr/blog/')
		expect(html).toContain('Une description écrite pour l’essai de la page d’un article.')
	})

	test('rien d’exécuté dans le navigateur : la page ne pose pas la marque du script glissé', async ({ page }) => {
		await page.goto(`/blog/${publie}`)
		expect(await page.evaluate(() => (window as unknown as { __glisse?: boolean }).__glisse)).toBeUndefined()
	})

	test('E65 : Article et fil d’Ariane, cohérents avec la page', async ({ page }) => {
		await page.goto(`/blog/${publie}`)
		const blocs = await donneesStructurees(page)
		const article = blocs.find(bloc => bloc['@type'] === 'Article')
		const fil = blocs.find(bloc => bloc['@type'] === 'BreadcrumbList') as
			| { itemListElement: { position: number; name: string; item: string }[] }
			| undefined
		expect(article).toMatchObject({
			headline: `Article d’essai ${suffixe}`,
			inLanguage: 'fr-FR',
			author: { name: 'Une rédactrice fictive' },
			mainEntityOfPage: { '@id': `https://my-makeup.fr/blog/${publie}` },
		})
		expect(fil?.itemListElement.map(({ position, name }) => [position, name])).toEqual([
			[1, 'Accueil'],
			[2, 'Blog'],
			[3, `Article d’essai ${suffixe}`],
		])
		expect(fil?.itemListElement.at(-1)?.item).toBe(`https://my-makeup.fr/blog/${publie}`)
	})

	test('un article sans contenu ni signature : 200, un h1, jamais « null » ni « undefined »', async ({
		page,
		request,
	}) => {
		const reponse = await page.goto(`/blog/${nu}`)
		expect(reponse?.status()).toBe(200)
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
		const texte = await page.locator('main').innerText()
		expect(texte).not.toMatch(/\b(?:null|undefined)\b/)
		expect(texte).not.toContain('Auteur.e')
		expect((await request.get(`/blog/${nu}`)).status()).toBe(200)
	})

	test('E59 : un brouillon et un inconnu répondent 404 en français, dans le gabarit', async ({ page, request }) => {
		for (const slug of [brouillon, `inexistant-${suffixe}`, 'Mauvais_Slug']) {
			const reponse = await page.goto(`/blog/${slug}`)
			expect(reponse?.status(), slug).toBe(404)
			await expect(page.getByRole('heading', { level: 1, name: '404 - Page non trouvée' })).toBeVisible()
			await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()
			// Without a browser, as a robot reads it: the status.
			expect((await request.get(`/blog/${slug}`)).status(), slug).toBe(404)
		}
	})

	test('il n’y a pas de débordement horizontal', async ({ page }) => {
		await page.goto(`/blog/${publie}`)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
	})
})
