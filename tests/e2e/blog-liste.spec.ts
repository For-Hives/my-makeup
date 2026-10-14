import { expect, test } from '@playwright/test'
import { creerContenu, supprimerContenu } from '../outils/pages-publiques'
import { titresPrincipaux } from '../outils/parite-urls'

/** The list of the blog (ticket 107): its h1, its tags, the published articles only, and the old double. */

test.describe('Blog', () => {
	// E64, for the blog: the SEO tags of the other pages are E64 of their own tickets.
	test('E64 : titre, description, canonique et un seul h1', { tag: '@smoke' }, async ({ page }) => {
		const reponse = await page.goto('/blog')

		expect(reponse?.status()).toBe(200)
		const titre = await page.title()
		expect(titre.length).toBeLessThanOrEqual(60)
		expect(titre).toMatch(/\| My-Makeup$/)
		const description = await page.locator('meta[name="description"]').getAttribute('content')
		expect(description?.length).toBeGreaterThanOrEqual(70)
		expect(description?.length).toBeLessThanOrEqual(155)
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://my-makeup.fr/blog')
		await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
		await expect(page.getByRole('heading', { level: 1, name: 'Blog & News' })).toBeVisible()
	})

	test('la liste montre les articles publiés, le plus récent d’abord, et jamais un brouillon', async ({ request }) => {
		test.setTimeout(120_000)
		const suffixe = Date.now().toString(36)
		const ancien = `essai-blog-ancien-${suffixe}`
		const recent = `essai-blog-recent-${suffixe}`
		const brouillon = `essai-blog-brouillon-${suffixe}`
		const identifiants = [
			await creerContenu(request, 'articles', { title: `Essai ${ancien}`, slug: ancien, _status: 'published' }),
		]
		try {
			// `publishedAt` is written by the server at the first publication: the second article comes later.
			await new Promise(suite => setTimeout(suite, 1100))
			identifiants.push(
				await creerContenu(request, 'articles', {
					title: `Essai ${recent}`,
					slug: recent,
					excerpt: 'Un extrait fictif.',
					_status: 'published',
				}),
				await creerContenu(request, 'articles', { title: `Essai ${brouillon}`, slug: brouillon, _status: 'draft' })
			)
			await expect
				.poll(async () => (await (await request.get('/blog')).text()).includes(`href="/blog/${recent}"`))
				.toBe(true)

			const reponse = await request.get('/blog')
			expect(reponse.status()).toBe(200)
			const html = await reponse.text()
			expect(titresPrincipaux(html)).toEqual(['Blog & News'])
			expect(html.indexOf(`href="/blog/${recent}"`)).toBeLessThan(html.indexOf(`href="/blog/${ancien}"`))
			expect(html).toContain('Un extrait fictif.')
			expect(html).not.toContain(brouillon)
		} finally {
			for (const id of identifiants) await supprimerContenu(request, 'articles', id)
		}
		await expect.poll(async () => (await (await request.get('/blog')).text()).includes(`/blog/${recent}`)).toBe(false)
	})

	test('U62 : /toutes-les-news redirige vers /blog en un saut, et la page arrive', async ({ request, page }) => {
		const saut = await request.get('/toutes-les-news', { maxRedirects: 0 })
		expect(saut.status()).toBe(301)
		expect(new URL(saut.headers().location ?? '', 'http://x').pathname).toBe('/blog')

		await page.goto('/toutes-les-news')
		await expect(page).toHaveURL(/\/blog$/)
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
	})
})
