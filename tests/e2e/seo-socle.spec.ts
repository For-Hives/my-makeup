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
		const reponse = await page.goto('/auth')

		expect(reponse?.headers()['x-robots-tag']).toBe('noindex, follow')
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
		await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
	})

	test('/search répond noindex en en-tête, même sans page, et n’est pas bloqué par robots.txt', async ({ request }) => {
		const reponse = await request.get('/search?city=Annecy')

		expect(reponse.headers()['x-robots-tag']).toBe('noindex, follow')
		const robots = await request.get('/robots.txt')
		if (robots.ok()) expect(await robots.text()).not.toMatch(/Disallow:\s*\/(search|auth)/)
	})

	test('une page publique ne coupe jamais la reprise par les assistants', async ({ page }) => {
		const reponse = await page.goto('/')
		const source = await page.content()

		expect(reponse?.headers()['x-robots-tag'] ?? '').not.toMatch(/noarchive|nocache|nosnippet|max-snippet/)
		expect(source).not.toMatch(/noarchive|nocache|nosnippet|max-snippet|data-nosnippet/)
	})
})
