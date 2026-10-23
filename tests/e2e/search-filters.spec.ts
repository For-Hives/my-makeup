import { expect, type Page, test } from '@playwright/test'
import { setSearchProfiles, TEST_WORD } from '../fixtures/search-profiles'
import { violationsSevere } from '../support/axe'
import { SCREENS } from '../support/e2e'

/**
 * The filters and the sort of the search (issue 1011), at 390 px and at 1440 px: the form keeps the word
 * and the city, the ceiling and the sort are in the address and survive the pages, an emptied search says
 * the filters did it. On each screen: no horizontal scroll, every control at least 44 px tall, axe finds no
 * « serious » or « critical » violation. Set `SCREENSHOT_DIR` to keep the screenshots. All made-up people.
 */

const SIZES = [SCREENS.mobile, SCREENS.chromium] as const
const WORD = encodeURIComponent(TEST_WORD)

test.beforeAll(async () => {
	test.setTimeout(180_000)
	await setSearchProfiles()
})

async function checkScreen(page: Page, label: string): Promise<void> {
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
		`${label} : défilement horizontal`
	).toBeLessThanOrEqual(0)
	const small = await page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>('main a, main button, main select, main summary')]
			.filter(element => {
				const box = element.getBoundingClientRect()
				if (box.width === 0 || box.height === 0) return false
				if (element.tagName === 'A' && element.closest('p')) return false
				return box.height < 44
			})
			.map(element => `${element.tagName} ${element.textContent?.trim().slice(0, 40)}`)
	)
	expect(small, `${label} : cibles de moins de 44 px`).toEqual([])
	expect(await violationsSevere(page), `${label} : axe`).toEqual([])
}

async function shot(page: Page, name: string): Promise<void> {
	if (process.env.SCREENSHOT_DIR)
		await page.screenshot({
			path: `${process.env.SCREENSHOT_DIR}/1011-${name}-${page.viewportSize()?.width}.png`,
			fullPage: true,
		})
}

/** The number in the h1 (« 6 résultats pour … »). */
async function countOf(page: Page): Promise<number> {
	const title = (await page.getByRole('heading', { level: 1 }).textContent()) ?? ''
	return Number(/^(\d+)/.exec(title)?.[1] ?? 0)
}

for (const size of SIZES) {
	test.describe(`1011 à ${size.width} px`, () => {
		test.use({ viewport: size })

		test('le prix maximum se choisit, reste dans l’adresse et réduit la liste', async ({ page }) => {
			await page.goto(`/search?search=${WORD}&city=Annecy`)
			const all = await countOf(page)
			expect(all).toBeGreaterThan(1)
			await checkScreen(page, 'recherche')
			await shot(page, 'recherche')

			await page.getByLabel('Prix de départ').selectOption('50')
			await page.getByRole('button', { name: 'Appliquer' }).click()
			await expect(page).toHaveURL(/maxPrice=50/)
			await expect(page).toHaveURL(new RegExp(`search=${TEST_WORD}`))
			await expect(page).toHaveURL(/city=Annecy/)
			const filtered = await countOf(page)
			expect(filtered).toBeGreaterThan(0)
			expect(filtered).toBeLessThan(all)
			await expect(page.getByLabel('Prix de départ')).toHaveValue('50')
			await expect(page.getByText('sur devis', { exact: false })).toBeVisible()
			await checkScreen(page, 'filtre de prix')
			await shot(page, 'filtre-prix')
		})

		test('le tri par prix met le moins cher en premier, sans changer le nombre de résultats', async ({ page }) => {
			await page.goto(`/search?search=${WORD}&city=Annecy`)
			const all = await countOf(page)
			await page.goto(`/search?search=${WORD}&city=Annecy&sort=price`)
			expect(await countOf(page)).toBe(all)
			await expect(page.getByLabel('Trier par')).toHaveValue('price')
			const prices = await page
				.locator('main a[href^="/profil/"]')
				.evaluateAll(cards =>
					cards.map(card =>
						Number(/dès\s+(\d[\d\s  ]*)/.exec(card.textContent ?? '')?.[1]?.replace(/\D/g, '') ?? Number.NaN)
					)
				)
			const priced = prices.filter(price => !Number.isNaN(price))
			expect(priced.length).toBeGreaterThan(1)
			// The sort acts in each section: the first section is non-decreasing.
			const firstSection = await page
				.locator('section')
				.first()
				.locator('a[href^="/profil/"]')
				.evaluateAll(cards =>
					cards.map(card =>
						Number(/dès\s+(\d[\d\s  ]*)/.exec(card.textContent ?? '')?.[1]?.replace(/\D/g, '') ?? Number.NaN)
					)
				)
			const firstPriced = firstSection.filter(price => !Number.isNaN(price))
			expect(firstPriced).toEqual(firstPriced.toSorted((a, b) => a - b))
			await checkScreen(page, 'tri par prix')
		})

		test('un filtre qui ne laisse personne le dit, et propose de le retirer', async ({ page }) => {
			// « Golf » is only the surname of a profile with no amount (« sur devis »).
			await page.goto('/search?search=Golf&maxPrice=50')
			await expect(page.getByRole('heading', { level: 1 })).toHaveText('Aucune maquilleuse ne correspond à ces filtres')
			await expect(page.locator('main')).not.toContainText('Personne n’est encore inscrite')
			await checkScreen(page, 'filtre sans résultat')
			await shot(page, 'filtre-vide')
			await page.getByRole('link', { name: 'Voir toutes les maquilleuses de cette recherche' }).click()
			await expect(page).toHaveURL(/\/search\?search=Golf$/)
			await expect(page.getByRole('heading', { level: 1 })).toHaveText('1 résultat pour « Golf »')
		})

		test('une valeur inconnue est ignorée : l’adresse d’avant répond comme avant', async ({ page }) => {
			await page.goto(`/search?search=${WORD}&city=Annecy`)
			const before = await countOf(page)
			await page.goto(`/search?search=${WORD}&city=Annecy&maxPrice=999&sort=nimportequoi`)
			expect(await countOf(page)).toBe(before)
			await expect(page.getByLabel('Prix de départ')).toHaveValue('')
			await expect(page.getByLabel('Trier par')).toHaveValue('relevance')
		})
	})
}
