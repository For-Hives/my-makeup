import { expect, type Page, test } from '@playwright/test'
import { RANKING_LINK_TEXT, RANKING_PATH, RANKING_RULES } from '../../src/lib/search/ranking'
import { setSearchProfiles, TEST_WORD } from '../fixtures/search-profiles'
import { violationsSevere } from '../support/axe'
import { SCREENS } from '../support/e2e'
import { refreshProfilePages } from '../support/public-pages'

/**
 * The page that explains the ranking (issue 1012), at 390 px and 1440 px: it is a public, indexable page, it says
 * every rule of the source, and the results link to it. No horizontal scroll, every link or button at least
 * 44 px tall, axe finds no « serious » or « critical » violation. Set `SCREENSHOT_DIR` to keep the screenshots.
 */

const SIZES = [SCREENS.mobile, SCREENS.chromium] as const

let reference: { id: number; specialite: string | null }

test.beforeAll(async () => {
	test.setTimeout(180_000)
	const found = (await setSearchProfiles()).get('reference')
	if (!found) throw new Error('Le profil d’essai « reference » manque.')
	reference = found
})

async function checkScreen(page: Page, label: string): Promise<void> {
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
		`${label} : défilement horizontal`
	).toBeLessThanOrEqual(0)
	const small = await page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>('main a, main button')]
			.filter(element => {
				const box = element.getBoundingClientRect()
				if (box.width === 0 || box.height === 0) return false
				if (element.closest('p')?.textContent !== element.textContent && element.closest('p')) return false
				return box.height < 44
			})
			.map(element => `${element.tagName} ${element.textContent?.trim().slice(0, 40)}`)
	)
	expect(small, `${label} : cibles de moins de 44 px`).toEqual([])
	expect(await violationsSevere(page), `${label} : axe`).toEqual([])
}

for (const size of SIZES) {
	test.describe(`1012 à ${size.width} px`, () => {
		test.use({ viewport: size })

		test('la page est publique, indexable, et dit chaque règle', async ({ page, request }) => {
			const response = await page.goto(RANKING_PATH)
			expect(response?.status()).toBe(200)
			expect(response?.headers()['x-robots-tag'] ?? '').not.toContain('noindex')
			await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0)
			await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/classement$/)
			await expect(page.getByRole('heading', { level: 1 })).toHaveText('Comment sont classées les maquilleuses')
			for (const rule of RANKING_RULES) await expect(page.locator('main')).toContainText(rule.text.slice(0, 60))
			await checkScreen(page, 'classement')
			if (process.env.SCREENSHOT_DIR)
				await page.screenshot({
					path: `${process.env.SCREENSHOT_DIR}/1012-classement-${size.width}.png`,
					fullPage: true,
				})
			const sitemap = await request.get('/sitemap.xml')
			expect(await sitemap.text()).toContain('/classement</loc>')
		})

		test('les résultats de la recherche renvoient vers la page', async ({ page, request }) => {
			// The search keeps the directory in the cache of Next: what an earlier spec of the shard cached has not
			// these profiles yet (they are loaded by the test process, which does not refresh it).
			await refreshProfilePages(request, reference)
			await page.goto(`/search?search=${encodeURIComponent(TEST_WORD)}&city=Annecy`)
			const link = page.getByRole('link', { name: RANKING_LINK_TEXT })
			await expect(link).toHaveAttribute('href', RANKING_PATH)
			await link.click()
			await expect(page).toHaveURL(/\/classement$/)
		})
	})
}
