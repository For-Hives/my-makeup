import { expect, type Page, test } from '@playwright/test'
import { setSearchProfiles } from '../fixtures/search-profiles'
import { createAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { SCREENS } from '../support/e2e'
import { refreshProfilePages } from '../support/public-pages'

/**
 * The home page (issues 1013 and 1066), at 390 px and at 1440 px: a guided form with labels in sight that leads to
 * the search, the block that says what the platform does, « Mise en avant » (absent until an admin ticks a profile,
 * six cards at most, never a profile that is not publishable), and the texts of the community, unfolded and without
 * the old title « Comment ça marche ». On each screen: no horizontal scroll, every control at least 44 px tall, axe finds no
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

		test('le bloc de droite dit ce que fait la plateforme, sans image à charger', async ({ page }) => {
			await page.goto('/')
			for (const line of [
				'Cherchez par événement et par lieu',
				'Consultez des profils vérifiés',
				'Écrivez en direct à la maquilleuse',
			])
				await expect(page.getByText(line)).toBeVisible()
			await expect(page.getByRole('heading', { level: 1 })).toHaveText(
				"Trouver la maquilleuse qui vous correspond n'a jamais été aussi simple"
			)
			await checkScreen(page, 'accueil')
		})

		test('« Comment ça marche » n’a plus de titre ni de pli, et le texte de la communauté reste', async ({
			page,
			request,
		}) => {
			const html = await (await request.get('/')).text()
			expect(html).not.toContain('Comment ça marche')
			expect(html).toContain('My-Makeup c&#x27;est avant tout une communauté')
			expect(html).toContain('Vous allez adorer cette nouvelle façon de collaborer')
			await page.goto('/')
			await expect(page.locator('main details')).toHaveCount(0)
			await expect(page.getByText('Vous allez adorer cette nouvelle façon de collaborer')).toBeVisible()
		})
	})
}

// The selection is a state of the whole bench: one test sets it, then looks at both screens (two tests at once, one per
// size, would tick and untick the same profiles under each other).
test('« Mise en avant » : absente sans profil coché, six cartes au plus, jamais un profil non publiable', async ({
	page,
	request,
}) => {
	test.setTimeout(120_000)
	const profiles = await setSearchProfiles()
	const headers = (await createAccount('admin')).session.enTetes
	const ids = [...profiles.values()].map(({ id }) => id)
	const set = async (featured: boolean) => {
		for (const id of ids) {
			const response = await request.patch(`/api/profiles/${id}`, { headers, data: { featured } })
			expect(response.ok(), `profil ${id}`).toBe(true)
		}
	}
	const reference = profiles.get('reference')
	const unpublishable = profiles.get('actif-non-publiable')
	if (!(reference && unpublishable)) throw new Error('profil d’essai manquant')
	try {
		await set(false)
		await refreshProfilePages(request, reference)
		for (const size of SIZES) {
			await page.setViewportSize(size)
			await page.goto('/')
			await expect(page.getByTestId('maquilleuses-mises-en-avant')).toHaveCount(0)
			await expect(page.getByText('Mise en avant')).toHaveCount(0)
		}

		await set(true)
		await refreshProfilePages(request, reference)
		for (const size of SIZES) {
			await page.setViewportSize(size)
			await page.goto('/')
			const block = page.getByTestId('maquilleuses-mises-en-avant')
			await expect(block.getByRole('heading', { name: 'Mise en avant' })).toBeVisible()
			const cards = block.locator('a[href^="/profil/"]')
			expect(await cards.count()).toBeGreaterThan(0)
			expect(await cards.count()).toBeLessThanOrEqual(6)
			await expect(block.locator(`a[href="/profil/${unpublishable.slug}"]`)).toHaveCount(0)
			await checkScreen(page, `accueil avec sélection à ${size.width} px`)
			if (process.env.SCREENSHOT_DIR)
				await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/1066-accueil-${size.width}.png`, fullPage: true })
		}
	} finally {
		await set(false)
		await refreshProfilePages(request, reference)
	}
})
