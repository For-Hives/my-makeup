import { expect, test } from '@playwright/test'
import { FROZEN_URL_FAMILIES } from '../../src/lib/frozen-urls'

/** The 404 and the error pages (ticket 069, E59 and E61). The page of a dead database is E60: see tests/unit/error-pages.test.tsx. */

test.describe('Pages d’erreur', { tag: '@mobile' }, () => {
	// E59
	test('une adresse inconnue répond 404 en français, dans le gabarit, jamais indexée', async ({ page }) => {
		const response = await page.goto('/cette-page-n-existe-pas')

		expect(response?.status()).toBe(404)
		await expect(page.getByRole('heading', { level: 1, name: '404 - Page non trouvée' })).toBeVisible()
		await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()
		await expect(page.getByRole('contentinfo')).toBeVisible()
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
		await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/)
		await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
	})

	test('un profil inconnu répond 404 dans le gabarit, et ne répond jamais 200', async ({ page, request }) => {
		const response = await page.goto('/profil/profil-qui-n-existe-pas')

		expect(response?.status()).toBe(404)
		await expect(page.getByRole('heading', { level: 1, name: '404 - Page non trouvée' })).toBeVisible()
		await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()
		// Without a browser, as a robot reads it.
		expect((await request.get('/profil/profil-qui-n-existe-pas')).status()).toBe(404)
		expect((await request.get('/blog/article-inconnu/encore')).status()).toBe(404)
	})

	test('les adresses historiques déjà en 404 le restent, attendues', async ({ request }) => {
		const historic = FROZEN_URL_FAMILIES.filter(famille => famille.kind === 'historique' && famille.status === 404)
		const urls = historic.flatMap(famille => famille.patterns).filter(motif => !/[<*]/.test(motif))
		expect(urls.length).toBeGreaterThanOrEqual(12)

		for (const url of urls) {
			const response = await request.get(url)
			expect(response.status(), url).toBe(404)
			expect(await response.text(), url).toContain('404 - Page non trouvée')
		}
	})

	// E61
	test('une méthode non permise sur une route de l’API répond 405', async ({ request }) => {
		const response = await request.post('/api/health')

		expect(response.status()).toBe(405)
	})
})
