import { expect, test } from '@playwright/test'

/** The common SEO base (ticket 070). */

test.describe('Socle SEO', () => {
	test('l’accueil : titre, description, adresse canonique absolue sans barre finale', async ({ page }) => {
		await page.goto('/')

		await expect(page).toHaveTitle(/\| My-Makeup$/)
		const description = await page.locator('meta[name="description"]').getAttribute('content')
		expect(description?.length).toBeGreaterThanOrEqual(70)
		expect(description?.length).toBeLessThanOrEqual(155)
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://my-makeup.fr')
		await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
	})

	test('les chemins de /auth répondent noindex en en-tête et en balise, sans canonique', async ({ page }) => {
		const response = await page.goto('/auth')

		expect(response?.headers()['x-robots-tag']).toBe('noindex, follow')
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
		await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
	})

	test('/search répond noindex en en-tête, même sans page, et n’est pas bloqué par robots.txt', async ({ request }) => {
		const response = await request.get('/search?city=Annecy')

		expect(response.headers()['x-robots-tag']).toBe('noindex, follow')
		const robots = await request.get('/robots.txt')
		// Only the general group: the groups of the assistants' crawlers close /search and /auth (ticket 1014).
		if (robots.ok()) expect((await robots.text()).split(/\n\s*\n/)[0] ?? '').not.toMatch(/Disallow:\s*\/(search|auth)/)
	})

	test('une page publique ne coupe jamais la reprise par les assistants', async ({ page }) => {
		const response = await page.goto('/')
		const source = await page.content()

		expect(response?.headers()['x-robots-tag'] ?? '').not.toMatch(/noarchive|nocache|nosnippet|max-snippet/)
		expect(source).not.toMatch(/noarchive|nocache|nosnippet|max-snippet|data-nosnippet/)
	})

	test('1014 : /llms.txt guide les assistants, sans nom ni page privée', async ({ request }) => {
		const response = await request.get('/llms.txt')

		expect(response.status()).toBe(200)
		expect(response.headers()['content-type']).toContain('text/plain')
		const text = await response.text()
		expect(text.startsWith('# My Makeup')).toBe(true)
		expect(text).toContain('](https://my-makeup.fr/sitemap.xml)')
		expect(text).not.toMatch(/\]\(https:\/\/my-makeup\.fr\/(auth|admin|api|search|profil)/)
	})

	test('E63 : robots.txt ouvre tout sauf l’API et donne le sitemap absolu', async ({ request }) => {
		const response = await request.get('/robots.txt')

		expect(response.status()).toBe(200)
		expect(response.headers()['content-type']).toContain('text/plain')
		const text = await response.text()
		expect(text).toMatch(/User-Agent: \*/i)
		expect(text).toContain('Allow: /')
		expect(text).toContain('Disallow: /api/')
		expect(text).toContain('Sitemap: https://my-makeup.fr/sitemap.xml')
		// The general group leaves /auth and /search open, so that their noindex is read; only the assistants' groups close them.
		const general = text.split(/\n\s*\n/)[0] ?? ''
		expect(general).not.toMatch(/Disallow:\s*\/(auth|search)/)
		// Ticket 1014: the assistants' groups.
		const groups = text.split(/\n\s*\n/)
		const searchGroup = groups.find(group => /User-Agent: OAI-SearchBot/i.test(group)) ?? ''
		expect(searchGroup).toContain('Allow: /\n')
		expect(searchGroup).toMatch(/Disallow: \/admin/)
		expect(searchGroup).toMatch(/Disallow: \/auth/)
		const trainingGroup = groups.find(group => /User-Agent: GPTBot/i.test(group)) ?? ''
		// Owner decision of 24/10/2026: training bots are allowed like the others, and no group blocks the whole site.
		expect(trainingGroup).toContain('Allow: /\n')
		expect(trainingGroup).toMatch(/Disallow: \/admin/)
		expect(text).not.toMatch(/Disallow: \/(\n|$)/)
	})
})
