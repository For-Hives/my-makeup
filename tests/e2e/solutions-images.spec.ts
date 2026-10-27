import { expect, test } from '@playwright/test'
import { violationsSevere } from '../support/axe'

/**
 * The generated illustrations of the Solutions pages (issue 1136, docs/illustrations-solutions.md), in a browser at 1440 and
 * 390 px: every one is served by the optimizer and decoded, the head one is loaded eagerly, nothing scrolls
 * sideways, no layout shift (CLS 0), no serious accessibility violation.
 */
const PAGES = [
	{ url: '/solutions/pour-les-particuliers', images: 5 },
	{ url: '/solutions/pour-les-maquilleuses', images: 4 },
] as const

test.describe('Les illustrations des solutions', { tag: '@mobile' }, () => {
	for (const { url, images } of PAGES)
		test(`${url} : ${images} illustrations chargées, aucun défilement latéral, CLS 0, axe`, async ({ page }) => {
			await page.addInitScript(() => {
				const w = window as unknown as { __cls: number }
				w.__cls = 0
				new PerformanceObserver(list => {
					for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[])
						if (!entry.hadRecentInput) w.__cls += entry.value
				}).observe({ type: 'layout-shift', buffered: true })
			})
			await page.goto(url)
			const pictures = page.locator('img[src*="assets%2Fsolutions%2F"]')
			await expect(pictures).toHaveCount(images)
			// Lazy pictures load when they come into view.
			for (let index = 0; index < images; index++) await pictures.nth(index).scrollIntoViewIfNeeded()
			await expect
				.poll(() => pictures.evaluateAll(list => list.every(img => (img as HTMLImageElement).naturalWidth > 0)))
				.toBe(true)
			await expect(pictures.first()).not.toHaveAttribute('loading', 'lazy')
			expect(await pictures.evaluateAll(list => list.every(img => img.getAttribute('alt') === ''))).toBe(true)
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
			).toBe(true)
			await page.evaluate(() => window.scrollTo(0, 0))
			await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
			expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBe(0)
			expect(await violationsSevere(page)).toEqual([])
		})
})
