import { expect, test } from '@playwright/test'
import { violationsSevere } from '../support/axe'
import { SCREENS } from '../support/e2e'

/**
 * The call to action at the foot of the public pages (issue 1067), at 390 px and at 1440 px: two links of at least
 * 44 px, no horizontal scroll, axe finds no serious violation, the animated background comes only when the block is
 * near the screen and goes when it leaves, and never with reduced motion. Set `SCREENSHOT_DIR` to keep screenshots.
 */

for (const size of [SCREENS.mobile, SCREENS.chromium]) {
	test.describe(`1067 à ${size.width} px`, () => {
		test.use({ viewport: size })

		test('deux invitations de 44 px au moins, sans défilement horizontal ni violation d’accessibilité', async ({
			page,
		}) => {
			await page.goto('/')
			const block = page.locator('section:has([data-backdrop])')
			await block.scrollIntoViewIfNeeded()
			for (const [name, href] of [
				['Trouver ma maquilleuse', '/search'],
				['Je suis maquilleuse', '/auth/signup'],
			] as const) {
				const link = block.getByRole('link', { name })
				await expect(link).toHaveAttribute('href', href)
				expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
			}
			expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
			expect(await violationsSevere(page)).toEqual([])
			if (process.env.SCREENSHOT_DIR)
				await block.screenshot({ path: `${process.env.SCREENSHOT_DIR}/1067-cta-${size.width}.png` })
		})

		test('le fond est le shader seulement avec un canvas, et le texte reste lisible dans les deux cas', async ({
			page,
		}) => {
			await page.goto('/')
			await page.locator('section:has([data-backdrop])').scrollIntoViewIfNeeded()
			const backdrop = page.locator('[data-backdrop]')
			await expect(backdrop).toHaveAttribute('data-backdrop', /^(shader|static)$/)
			const mode = await backdrop.getAttribute('data-backdrop')
			await expect(page.locator('[data-backdrop] canvas')).toHaveCount(mode === 'shader' ? 1 : 0)
			await expect(page.getByRole('heading', { name: /Rejoignez/ })).toBeVisible()
			// Leaving the screen unmounts the shader: its removal is tried by the unit test of the component.
		})

		test.describe('avec un mouvement réduit', () => {
			test.use({ contextOptions: { reducedMotion: 'reduce' } })

			test('le fond reste fixe et aucun morceau du shader n’est chargé', async ({ page }) => {
				const scripts: string[] = []
				page.on('response', response => {
					if (response.url().endsWith('.js')) scripts.push(response.url())
				})
				await page.goto('/', { waitUntil: 'networkidle' })
				const before = scripts.length
				await page.locator('section:has([data-backdrop])').scrollIntoViewIfNeeded()
				await page.waitForLoadState('networkidle')
				await expect(page.locator('[data-backdrop]')).toHaveAttribute('data-backdrop', 'static')
				await expect(page.locator('[data-backdrop] canvas')).toHaveCount(0)
				expect(scripts.length, 'aucun morceau de JavaScript chargé à l’approche du bloc').toBe(before)
			})
		})
	})
}
