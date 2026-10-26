import { expect, type Locator, type Page, test } from '@playwright/test'
import { setSearchProfiles } from '../fixtures/search-profiles'
import { createAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { SCREENS } from '../support/e2e'
import { refreshProfilePages } from '../support/public-pages'

/**
 * The home page (issues 1013 and 1066, hero « en arche » of 25/10/2026), at 390 px and at 1440 px: a guided form with
 * labels in sight that leads to the search and shows its texts whole at every width, a hero reduced to the heading, one
 * sentence and the search, « Mise en avant » (absent until a profile is verified,
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
				// A control drawn only at the keyboard focus, as a skip link (the pause button of the hero): its size is
				// read once it shows (tests/e2e/home-hero.spec.ts).
				if (element.matches('.sr-only')) return false
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

		test('le haut de page va à l’essentiel : le titre, une phrase, la recherche', async ({ page }) => {
			await page.goto('/')
			await expect(page.getByRole('heading', { level: 1 })).toHaveText(
				'Trouvez la maquilleuse qui vous correspond près de chez vous.'
			)
			await expect(page.locator('.home-hero-lede')).toContainText('Des maquilleuses professionnelles')
			await expect(page.getByRole('search')).toBeVisible()
			// Neither the eyebrow nor the three numbered lines (Andy, 25/10/2026).
			await expect(page.locator('section.home-hero ol')).toHaveCount(0)
			await expect(page.getByText('Maquilleuses professionnelles, partout en France')).toHaveCount(0)
			await checkScreen(page, 'accueil')
		})

		test('« Comment ça marche » n’a plus de titre ni de pli, et le texte de la communauté reste', async ({
			page,
			request,
		}) => {
			const html = await (await request.get('/')).text()
			expect(html).not.toContain('Comment ça marche')
			await page.goto('/')
			// The last word of each title is an italic span: the headings are read as text by the browser, not from the markup.
			const headings = await page.locator('main h2').allInnerTexts()
			expect(headings.map(text => text.replaceAll('’', "'"))).toContain("My-Makeup c'est avant tout une communauté")
			expect(headings).toContain('Vous allez adorer cette nouvelle façon de collaborer')
			await expect(page.locator('main details')).toHaveCount(0)
			await expect(page.getByText('Vous allez adorer cette nouvelle façon de collaborer')).toBeVisible()
		})
	})
}

// The search is drawn from the width of its box (container queries): a card, two fields side by side over the button,
// one pill. At every width the text of each part shows whole (the placeholder was cut at 640-695 px once), and a city
// of a usual length too: a much longer one scrolls in its field, as in any text field.
test('à chaque largeur, la recherche montre en entier ses libellés, son texte indicatif, la ville tapée et son bouton', async ({
	page,
}) => {
	await page.goto('/')
	await page.locator('#accueil-lieu').fill('Aix-en-Provence')
	for (const width of [360, 390, 480, 640, 680, 720, 768, 1024, 1100, 1180, 1280, 1366, 1440]) {
		await page.setViewportSize({ width, height: 900 })
		const facts = await page.evaluate(() => {
			const context = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D
			/** The width the text of an element takes in its own font, against the room its box gives it. */
			const fits = (element: HTMLElement, text: string): boolean => {
				const style = getComputedStyle(element)
				context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
				context.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing
				const room = element.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
				return context.measureText(style.textTransform === 'uppercase' ? text.toUpperCase() : text).width <= room + 0.5
			}
			const input = document.querySelector('#accueil-lieu') as HTMLInputElement
			const select = document.querySelector('#accueil-evenement') as HTMLSelectElement
			const labels = [...document.querySelectorAll<HTMLElement>('.guided-search-label')]
			const field = (label: HTMLElement) => label.parentElement as HTMLElement
			const button = document.querySelector('.guided-search-submit') as HTMLElement
			const form = (document.querySelector('form.guided-search') as HTMLElement).getBoundingClientRect()
			const column = (document.querySelector('.home-hero-text') as HTMLElement).getBoundingClientRect()
			return {
				placeholder: fits(input, input.placeholder),
				typed: fits(input, input.value),
				choice: fits(select, select.selectedOptions[0]?.textContent ?? ''),
				// A label stands over its field from the left padding of the field to the right edge of the segment.
				labels: labels.every(
					label => label.getBoundingClientRect().right <= field(label).getBoundingClientRect().right
				),
				button: button.scrollWidth <= button.clientWidth,
				inColumn: form.right <= column.right + 0.5,
				layout: getComputedStyle(document.querySelector('form.guided-search') as Element).display,
			}
		})
		expect(facts, `${width} px`).toMatchObject({
			placeholder: true,
			typed: true,
			choice: true,
			labels: true,
			button: true,
			inColumn: true,
		})
		expect(['flex', 'grid'], `${width} px`).toContain(facts.layout)
	}
	// The pill on a wide screen, the card on a phone.
	await page.setViewportSize(SCREENS.chromium)
	expect((await page.locator('form.guided-search').boundingBox())?.height).toBeCloseTo(72, 0)
	await page.setViewportSize(SCREENS.mobile)
	const [event, place] = await page
		.locator('.guided-search-field')
		.evaluateAll(fields => fields.map(field => field.getBoundingClientRect().top))
	expect(place ?? 0).toBeGreaterThan(event ?? 0)
})

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
