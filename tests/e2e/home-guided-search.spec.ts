import { expect, type Locator, type Page, test } from '@playwright/test'
import { setSearchProfiles } from '../fixtures/search-profiles'
import { createAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { SCREENS } from '../support/e2e'
import { refreshProfilePages } from '../support/public-pages'

/**
 * The home page (issues 1013 and 1066, hero « en arche » of 25/10/2026), at 390 px and at 1440 px: a guided form with
 * labels in sight that leads to the search, the three lines that say what the platform does, « Mise en avant » (absent until a profile is verified,
 * six cards at most, drawn at random at each load, never a profile that is not publishable), and the texts of the community, unfolded and without
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

		test('en couleurs forcées (contraste élevé de Windows), les deux champs gardent un anneau de focus', async ({
			page,
		}) => {
			await page.emulateMedia({ forcedColors: 'active' })
			await page.goto('/')
			// From the keyboard, so that :focus-visible matches the select as it does the input.
			for (const id of ['accueil-evenement', 'accueil-lieu']) {
				const field = page.locator(`#${id}`)
				await page.keyboard.press('Shift')
				await field.focus()
				const ring = await field.evaluate(element => {
					const style = getComputedStyle(element)
					return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) }
				})
				expect(ring.style, id).not.toBe('none')
				expect(ring.width, id).toBeGreaterThanOrEqual(2)
			}
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

		test('le haut de page dit ce que fait la plateforme, et son titre reste celui du site en ligne', async ({
			page,
		}) => {
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

// The pool is a state of the whole bench: one test sets it, then looks at both screens (two tests at once, one per
// size, would tick and untick the same profiles under each other). The bench ships one profile already verified
// (`essai-verifiee`): the test saves what each profile was and puts it back.
test('« Mise en avant » : absente sans profil vérifié, six cartes au plus tirées parmi les profils vérifiés, jamais un profil non publiable', async ({
	browser,
	page,
	request,
}) => {
	test.setTimeout(180_000)
	const profiles = await setSearchProfiles()
	const headers = (await createAccount('admin')).session.enTetes
	const ids = [...profiles.values()].map(({ id }) => id)
	const set = async (verified: boolean) => {
		for (const id of ids) {
			const response = await request.patch(`/api/profiles/${id}`, { headers, data: { verified } })
			expect(response.ok(), `profil ${id}`).toBe(true)
		}
	}
	const reference = profiles.get('reference')
	const unpublishable = profiles.get('actif-non-publiable')
	const alreadyVerified = profiles.get('verifiee')
	if (!(reference && unpublishable && alreadyVerified)) throw new Error('profil d’essai manquant')
	const shownSlugs = (block: Locator) =>
		block
			.locator('.featured-list > li:visible a[href^="/profil/"]')
			.evaluateAll(links => links.map(link => (link.getAttribute('href') ?? '').replace('/profil/', '')))
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
			const visible = (await shownSlugs(block)).length
			expect(visible).toBeGreaterThan(0)
			expect(visible).toBeLessThanOrEqual(6)
			await expect(block.locator(`a[href="/profil/${unpublishable.slug}"]`)).toHaveCount(0)
			await checkScreen(page, `accueil avec sélection à ${size.width} px`)
			if (process.env.SCREENSHOT_DIR)
				await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/1066-accueil-${size.width}.png`, fullPage: true })
		}

		// The draw (issue 1066): the cached HTML carries every candidate; the browser shows six of them, drawn at load.
		await page.setViewportSize(SCREENS.chromium)
		await page.goto('/')
		const block = page.getByTestId('maquilleuses-mises-en-avant')
		const candidates = await block.locator('.featured-list > li').count()
		const inOrder = await block
			.locator('.featured-list > li a[href^="/profil/"]')
			.evaluateAll(links => links.map(link => (link.getAttribute('href') ?? '').replace('/profil/', '')))
		expect(candidates).toBe(inOrder.length)
		if (candidates > 6) {
			const drawWith = async (value: number): Promise<string[]> => {
				const context = await browser.newContext({ viewport: SCREENS.chromium })
				try {
					const drawn = await context.newPage()
					await drawn.addInitScript(fixed => {
						Math.random = () => fixed
					}, value)
					await drawn.goto('/')
					const slugs = await shownSlugs(drawn.getByTestId('maquilleuses-mises-en-avant'))
					expect(slugs).toHaveLength(6)
					expect(new Set(slugs).size).toBe(6)
					for (const slug of slugs) expect(inOrder).toContain(slug)
					return slugs
				} finally {
					await context.close()
				}
			}
			expect(await drawWith(0.01)).not.toEqual(await drawWith(0.99))
			// Without JavaScript: the first six, in the order of the directory, the same at each load.
			const plain = await browser.newContext({ javaScriptEnabled: false, viewport: SCREENS.chromium })
			try {
				const noScript = await plain.newPage()
				await noScript.goto('/')
				expect(await shownSlugs(noScript.getByTestId('maquilleuses-mises-en-avant'))).toEqual(inOrder.slice(0, 6))
			} finally {
				await plain.close()
			}
		} else {
			expect(await shownSlugs(block)).toEqual(inOrder)
		}
	} finally {
		await set(false)
		const response = await request.patch(`/api/profiles/${alreadyVerified.id}`, { headers, data: { verified: true } })
		expect(response.ok()).toBe(true)
		await refreshProfilePages(request, reference)
	}
})
