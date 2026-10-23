import { expect, type Page, test } from '@playwright/test'
import { setSearchProfiles } from '../fixtures/search-profiles'
import { violationsSevere } from '../support/axe'
import { SCREENS } from '../support/e2e'
import { refreshProfilePages } from '../support/public-pages'

/**
 * The home page (issue 1013), at 390 px and at 1440 px: a guided form with labels in sight that leads to the
 * search, three recently updated makeup artists in the first screens, the folded « Comment ça marche » whose text
 * stays in the HTML. On each screen: no horizontal scroll, every control at least 44 px tall, axe finds no
 * « serious » or « critical » violation. Set `SCREENSHOT_DIR` to keep the screenshots. All made-up people.
 */

const SIZES = [SCREENS.mobile, SCREENS.chromium] as const

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
		[...document.querySelectorAll<HTMLElement>('main a, main button, main select, main input, main summary')]
			.filter(element => {
				const box = element.getBoundingClientRect()
				if (box.width === 0 || box.height === 0) return false
				if (element.tagName === 'A' && element.closest('p, li > div')) return false
				return box.height < 44
			})
			.map(element => `${element.tagName} ${element.textContent?.trim().slice(0, 40)}`)
	)
	expect(small, `${label} : cibles de moins de 44 px`).toEqual([])
	expect(await violationsSevere(page), `${label} : axe`).toEqual([])
}

for (const size of SIZES) {
	test.describe(`1013 à ${size.width} px`, () => {
		test.use({ viewport: size })

		test('le formulaire guidé : libellés visibles, et il mène à la recherche', async ({ page, request }) => {
			const profiles = await setSearchProfiles()
			const reference = profiles.get('reference')
			if (!reference) throw new Error('profil d’essai manquant')
			await refreshProfilePages(request, reference)
			await page.goto('/')
			await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
			await expect(page.getByText('Pour quel événement ?')).toBeVisible()
			await expect(page.getByText('Où ?', { exact: true })).toBeVisible()
			await expect(page.getByLabel('Où ?')).toHaveAttribute('placeholder', 'Ville ou code postal')
			await checkScreen(page, 'accueil')
			if (process.env.SCREENSHOT_DIR)
				await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/1013-accueil-${size.width}.png`, fullPage: true })

			await page.getByLabel('Pour quel événement ?').selectOption({ label: 'Mariage' })
			await page.getByLabel('Où ?').fill('Annecy')
			await page.getByRole('button', { name: 'Voir les maquilleuses' }).click()
			await expect(page).toHaveURL(/\/search\?search=mariage&city=Annecy$/)
			await expect(page.getByRole('heading', { level: 1 })).toContainText('« mariage » à « Annecy »')
			expect(await page.locator('main a[href^="/profil/"]').count()).toBeGreaterThan(0)
		})

		test('une ville vide est refusée par le formulaire, « Autre » ne tape aucun mot', async ({ page }) => {
			await page.goto('/')
			await page.getByRole('button', { name: 'Voir les maquilleuses' }).click()
			await expect(page).toHaveURL(/\/$/)
			await page.getByLabel('Pour quel événement ?').selectOption({ label: 'Autre' })
			await page.getByLabel('Où ?').fill('Annecy')
			await page.getByRole('button', { name: 'Voir les maquilleuses' }).click()
			await expect(page).toHaveURL(/\/search\?search=&city=Annecy$/)
		})

		test('des maquilleuses sont visibles dès l’arrivée, et le texte replié reste dans le HTML', async ({
			page,
			request,
		}) => {
			const profiles = await setSearchProfiles()
			const reference = profiles.get('reference')
			if (!reference) throw new Error('profil d’essai manquant')
			await refreshProfilePages(request, reference)
			await page.goto('/')
			const block = page.getByTestId('maquilleuses-recentes')
			await expect(block.getByRole('heading', { name: 'Récemment mises à jour' })).toBeVisible()
			const cards = block.locator('a[href^="/profil/"]')
			expect(await cards.count()).toBeGreaterThan(0)
			expect(await cards.count()).toBeLessThanOrEqual(3)
			const box = await block.boundingBox()
			expect(box?.y ?? 9999, 'le bloc commence dans les deux premiers écrans').toBeLessThan(size.height * 2)

			const html = await (await request.get('/')).text()
			expect(html).toContain('Comment ça marche')
			expect(html).toContain('Vous allez adorer cette nouvelle façon de collaborer')
			const details = page.locator('main details')
			await expect(details).not.toHaveAttribute('open', '')
			await details.locator('summary').click()
			await expect(details).toHaveAttribute('open', '')
			await expect(page.getByText('Vous allez adorer cette nouvelle façon de collaborer')).toBeVisible()
		})
	})
}
