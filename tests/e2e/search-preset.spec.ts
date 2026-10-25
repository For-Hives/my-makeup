import { expect, type Page, test } from '@playwright/test'
import { type SearchProfile, setSearchProfiles } from '../fixtures/search-profiles'
import { violationsSevere } from '../support/axe'
import { SCREENS } from '../support/e2e'
import { refreshProfilePages } from '../support/public-pages'

/**
 * The search page without a criterion, at 390 px and at 1440 px: one h1, the bar with its two labelled fields, the idea
 * chips, and the preset under a title that says its criterion. The bench has no visits, so the preset is the documented
 * order (« Les mieux classées »); the other branch is played by tests/unit/search-preset.test.ts and by
 * tests/integration/most-viewed.test.ts. No contact detail in the cards, no sideways scroll, nothing under 44 px, axe.
 */

async function checkScreen(page: Page, label: string): Promise<void> {
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
		`${label} : défilement horizontal`
	).toBeLessThanOrEqual(0)
	const small = await page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>('main a, main button, main input')]
			.filter(element => {
				const box = (element.closest('article') ?? element).getBoundingClientRect()
				if (box.width === 0 || box.height === 0) return false
				if (element.tagName === 'A' && element.closest('p')) return false
				return box.height < 44
			})
			.map(element => `${element.tagName} ${element.textContent?.trim().slice(0, 40)}`)
	)
	expect(small, `${label} : cibles de moins de 44 px`).toEqual([])
	expect(await violationsSevere(page), `${label} : axe`).toEqual([])
}

let reference: SearchProfile

test.beforeAll(async () => {
	test.setTimeout(180_000)
	const found = (await setSearchProfiles()).get('reference')
	if (!found) throw new Error('pas de profil d’essai « reference »')
	reference = found
})

test.beforeEach(async ({ request }) => {
	await refreshProfilePages(request, reference)
})

for (const size of [SCREENS.mobile, SCREENS.chromium]) {
	test.describe(`sélection de la recherche à ${size.width} px`, () => {
		test.use({ viewport: size })

		test('un titre, la barre, des idées et la sélection qui dit son critère', async ({ page }) => {
			await page.goto('/search')
			await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rechercher une maquilleuse')
			await expect(page.getByLabel('Prestation recherchée')).toBeVisible()
			await expect(page.getByLabel('Ville de la prestation')).toBeVisible()
			const title = page.locator('#recherche-selection')
			await expect(title).toHaveText(/^(Les plus consultées en France|Les mieux classées)$/)
			const cards = page.locator('main [data-profile-card]')
			expect(await cards.count()).toBeGreaterThan(0)
			expect(await cards.count()).toBeLessThanOrEqual(6)
			await expect(page.locator('main a[href^="tel:"], main a[href^="mailto:"]')).toHaveCount(0)
			await page.getByRole('link', { name: 'Mariage' }).click()
			await expect(page).toHaveURL(/\/search\?search=mariage$/)
		})

		test('aucune violation, aucune cible trop petite, rien ne déborde', async ({ page }) => {
			await page.goto('/search')
			await checkScreen(page, 'sélection')
		})
	})
}
