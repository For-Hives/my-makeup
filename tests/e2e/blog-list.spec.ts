import { expect, test } from '@playwright/test'
import { createContent, deleteContent } from '../support/public-pages'
import { mainTitles } from '../support/url-parity'

/** The list of the blog (ticket 107): its h1, its tags, the published articles only, and the old double. */

test.describe('Blog', () => {
	// E64, for the blog: the SEO tags of the other pages are E64 of their own tickets.
	test('E64 : titre, description, canonique et un seul h1', { tag: '@smoke' }, async ({ page }) => {
		const response = await page.goto('/blog')

		expect(response?.status()).toBe(200)
		const title = await page.title()
		expect(title.length).toBeLessThanOrEqual(60)
		// The title is the one of the old site, with no brand (ticket 274).
		expect(title).toBe('Blog de My-Makeup')
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
		const suffix = Date.now().toString(36)
		const old = `essai-blog-ancien-${suffix}`
		const recent = `essai-blog-recent-${suffix}`
		const draft = `essai-blog-brouillon-${suffix}`
		const identifiers = [
			await createContent(request, 'articles', { title: `Essai ${old}`, slug: old, _status: 'published' }),
		]
		try {
			// `publishedAt` is written by the server at the first publication: the second article comes later.
			const start = Date.now()
			await expect.poll(() => Date.now() - start, { intervals: [250] }).toBeGreaterThan(1100)
			identifiers.push(
				await createContent(request, 'articles', {
					title: `Essai ${recent}`,
					slug: recent,
					excerpt: 'Un extrait fictif.',
					_status: 'published',
				}),
				await createContent(request, 'articles', { title: `Essai ${draft}`, slug: draft, _status: 'draft' })
			)
			await expect
				.poll(async () => (await (await request.get('/blog')).text()).includes(`href="/blog/${recent}"`))
				.toBe(true)

			const response = await request.get('/blog')
			expect(response.status()).toBe(200)
			const html = await response.text()
			expect(mainTitles(html)).toEqual(['Blog & News'])
			expect(html.indexOf(`href="/blog/${recent}"`)).toBeLessThan(html.indexOf(`href="/blog/${old}"`))
			expect(html).toContain('Un extrait fictif.')
			// One article is the large one, and it comes before the cards (other files make articles in parallel: which one is not asked).
			expect(html.match(/data-featured/g)).toHaveLength(1)
			expect(html.indexOf('data-featured')).toBeLessThan(html.indexOf('data-article-card'))
			expect(html).not.toContain(draft)
		} finally {
			for (const id of identifiers) await deleteContent(request, 'articles', id)
		}
		await expect.poll(async () => (await (await request.get('/blog')).text()).includes(`/blog/${recent}`)).toBe(false)
	})

	test('U62 : /toutes-les-news redirige vers /blog en un saut, et la page arrive', async ({ request, page }) => {
		const jump = await request.get('/toutes-les-news', { maxRedirects: 0 })
		expect(jump.status()).toBe(301)
		expect(new URL(jump.headers().location ?? '', 'http://x').pathname).toBe('/blog')

		await page.goto('/toutes-les-news')
		await expect(page).toHaveURL(/\/blog$/)
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
	})
})
