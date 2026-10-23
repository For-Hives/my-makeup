import { expect, type Page, test } from '@playwright/test'
import { createContent, deleteContent } from '../support/public-pages'

/**
 * The page of a speciality, end to end (ticket 108; plan 02 E59 and E65): 200 with one h1 for a published
 * talent, its presentation and content, a link to the search, the title of the tab written by the newsroom,
 * the breadcrumb, and a 404 in French for a draft or an unknown slug. The talents are made up and taken away
 * at the end.
 */

const suffix = Date.now().toString(36)
const published = `essai-talent-${suffix}`
const withoutTitle = `essai-talent-sans-titre-${suffix}`
const draft = `essai-talent-brouillon-${suffix}`
const PAGE_TITLE = 'Maquillage fictif : une maquilleuse près de chez vous'

const identifiers: { collection: 'talents'; id: number }[] = []

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request }) => {
	identifiers.push(
		{
			collection: 'talents',
			id: await createContent(request, 'talents', {
				title: `Talent ${suffix}`,
				slug: published,
				seo_title: `Le maquillage fictif ${suffix}`,
				pageTitle: PAGE_TITLE,
				description: 'Une présentation écrite pour l’essai de la page d’un talent.',
				seo_description: 'Une description écrite pour les moteurs de recherche, pour l’essai.',
				content: '# Un titre du texte\n\nUn paragraphe avec du **gras**.\n\n<script>window.__glisse = true</script>\n',
				_status: 'published',
			}),
		},
		{
			collection: 'talents',
			id: await createContent(request, 'talents', {
				title: `Talent nu ${suffix}`,
				slug: withoutTitle,
				_status: 'published',
			}),
		},
		{
			collection: 'talents',
			id: await createContent(request, 'talents', { title: 'Brouillon', slug: draft, _status: 'draft' }),
		}
	)
})

test.afterAll(async ({ request }) => {
	for (const { collection, id } of identifiers) await deleteContent(request, collection, id)
})

async function structuredData(page: Page): Promise<Record<string, unknown>[]> {
	const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
	return blocks.map(bloc => JSON.parse(bloc) as Record<string, unknown>)
}

test.describe('E59 et E65 : la page d’un talent', { tag: '@mobile' }, () => {
	test('@smoke un talent publié répond 200 avec un seul h1, sa présentation, son contenu et un lien vers la recherche', async ({
		page,
	}) => {
		const response = await page.goto(`/talent/${published}`)
		expect(response?.status()).toBe(200)
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Le maquillage fictif ${suffix}`)
		await expect(page.getByText('Une présentation écrite pour l’essai de la page d’un talent.')).toBeVisible()
		await expect(page.getByRole('heading', { level: 2, name: 'Un titre du texte' })).toBeVisible()
		await expect(page.getByRole('article').getByRole('link', { name: 'Trouver une maquilleuse' })).toHaveAttribute(
			'href',
			'/search'
		)
		await expect(page.getByText("L'équipe My-Makeup")).toBeVisible()
		await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()
	})

	test('le HTML du serveur : un seul h1, aucun script glissé, le titre de l’onglet écrit par la rédaction, distinct du h1', async ({
		request,
	}) => {
		const html = await (await request.get(`/talent/${published}`)).text()
		expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
		expect(html).not.toContain('__glisse = true</script>')
		expect(html).toContain(`<title>${PAGE_TITLE}</title>`)
		expect(PAGE_TITLE.length).toBeGreaterThanOrEqual(50)
		expect(PAGE_TITLE.length).toBeLessThanOrEqual(60)
		expect(html).toContain('<link rel="canonical" href="https://my-makeup.fr/talent/')
		expect(html).toContain('Une description écrite pour les moteurs de recherche, pour l’essai.')
	})

	test('sans titre de page écrit, l’onglet garde le titre court suivi du nom du site, comme aujourd’hui', async ({
		request,
	}) => {
		const html = await (await request.get(`/talent/${withoutTitle}`)).text()
		expect(html).toContain(`<title>Talent nu ${suffix} | My-Makeup</title>`)
		expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
		expect(html).not.toMatch(/>(?:null|undefined)</)
	})

	test('E65 : le fil d’Ariane, cohérent avec la page', async ({ page }) => {
		await page.goto(`/talent/${published}`)
		const thread = (await structuredData(page)).find(bloc => bloc['@type'] === 'BreadcrumbList') as
			| { itemListElement: { position: number; name: string; item: string }[] }
			| undefined
		expect(thread?.itemListElement).toEqual([
			{ '@type': 'ListItem', position: 1, name: 'Accueil', item: 'https://my-makeup.fr' },
			{ '@type': 'ListItem', position: 2, name: `Talent ${suffix}`, item: `https://my-makeup.fr/talent/${published}` },
		])
	})

	test('E59 : un brouillon et un inconnu répondent 404 en français, dans le gabarit', async ({ page, request }) => {
		for (const slug of [draft, `inexistant-${suffix}`, 'Mauvais_Slug']) {
			const response = await page.goto(`/talent/${slug}`)
			expect(response?.status(), slug).toBe(404)
			await expect(page.getByRole('heading', { level: 1, name: '404 - Page non trouvée' })).toBeVisible()
			await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()
			// Without a browser, as a robot reads it: the status.
			expect((await request.get(`/talent/${slug}`)).status(), slug).toBe(404)
		}
	})

	test('il n’y a pas de débordement horizontal', async ({ page }) => {
		await page.goto(`/talent/${published}`)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
	})
})
