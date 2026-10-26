import { expect, type Page, test } from '@playwright/test'
import { violationsSevere } from '../support/axe'

/**
 * The search under the head of the guides and of « Pourquoi particulier » (issue 1138): two pill fields and one button
 * on ONE line from 768 px up (1440, 1024), one under the other on a phone (390), at least 44 px each, no horizontal
 * scroll, no layout shift, axe finds nothing serious. The two pages, and the form still goes to /search with the word
 * and the city.
 */

const PAGES = [
	{ name: 'Pourquoi particulier', path: '/pourquoi-utiliser-my-makeup-en-tant-que-particulier' },
	{ name: 'un guide du particulier', path: '/particulier/trouver-une-maquilleuse' },
] as const

const boxes = async (page: Page) => {
	const form = page.getByRole('search')
	const what = form.getByLabel('Prestation recherchée')
	const where = form.getByLabel('Ville de la prestation')
	const button = form.getByRole('button', { name: 'Trouver une maquilleuse' })
	await what.scrollIntoViewIfNeeded()
	const [a, b, c] = await Promise.all([what.boundingBox(), where.boundingBox(), button.boundingBox()])
	if (!a || !b || !c) throw new Error('A control of the search is not on screen.')
	return { a, b, c }
}

/** The fonts are in and two frames are painted: what shifts, shifted. */
const settled = (page: Page) =>
	page.evaluate(() =>
		document.fonts.ready.then(
			() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())))
		)
	)

test.describe('La recherche des guides', { tag: '@mobile' }, () => {
	for (const { name, path } of PAGES) {
		test(`${name} : une ligne sur ordinateur, trois lignes sur téléphone, cibles de 44 px`, async ({ page }) => {
			await page.goto(path)
			const { a, b, c } = await boxes(page)
			const phone = (page.viewportSize()?.width ?? 1440) < 768
			if (phone) {
				expect(b.y).toBeGreaterThan(a.y + a.height - 1)
				expect(c.y).toBeGreaterThan(b.y + b.height - 1)
			} else {
				// One line: the three tops and the three middles are the same.
				expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1)
				expect(Math.abs(a.y + a.height / 2 - (c.y + c.height / 2))).toBeLessThanOrEqual(1)
				expect(b.x).toBeGreaterThan(a.x + a.width - 1)
				expect(c.x).toBeGreaterThan(b.x + b.width - 1)
			}
			for (const box of [a, b, c]) expect(box.height).toBeGreaterThanOrEqual(44)
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
			await page.screenshot({
				path: `test-results/essais/guide-search-${name.replaceAll(' ', '-')}-${test.info().project.name}.png`,
			})
		})
	}

	test('Pourquoi particulier : toujours une ligne à 1024 px', async ({ page }) => {
		await page.setViewportSize({ width: 1024, height: 800 })
		await page.goto(PAGES[0].path)
		const { a, b, c } = await boxes(page)
		expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1)
		expect(Math.abs(a.y - c.y)).toBeLessThanOrEqual(2)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
	})

	test('le formulaire va à /search avec le mot et la ville', async ({ page }) => {
		await page.goto(PAGES[0].path)
		await page.getByLabel('Prestation recherchée').fill('mariage')
		await page.getByLabel('Ville de la prestation').fill('Annecy')
		await page.getByRole('button', { name: 'Trouver une maquilleuse' }).click()
		await expect(page).toHaveURL(/\/search\?search=mariage&city=Annecy/)
	})

	test('aucun décalage de mise en page, aucune violation grave', async ({ page }) => {
		await page.addInitScript(() => {
			const w = window as unknown as { __cls: number }
			w.__cls = 0
			new PerformanceObserver(list => {
				for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[])
					if (!entry.hadRecentInput) w.__cls += entry.value
			}).observe({ type: 'layout-shift', buffered: true })
		})
		await page.goto(PAGES[0].path)
		await page.getByRole('search').scrollIntoViewIfNeeded()
		await settled(page)
		expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBe(0)
		expect(await violationsSevere(page)).toEqual([])
	})
})
