import { expect, type Page, test } from '@playwright/test'
import { type PageProfile, setPageProfiles } from '../fixtures/page-profiles'
import { SCREENS } from '../support/e2e'
import { users } from '../support/lock'
import { testPayload } from '../support/payload-test'

/**
 * The motion system (issue 1069, docs/mouvement.md), end to end, at 390 px and 1440 px: the first screen is never
 * hidden at first paint, the layout never shifts (CLS 0) while the whole page is scrolled, the content is in the page
 * without script, and with reduced motion nothing slides or fades and every transition ends at once.
 */

const PAGES = ['/', '/search', '/a-propos']

/** The sum of the layout shifts that no input explains, read from the browser after the page has been scrolled through. */
async function layoutShift(page: Page): Promise<number> {
	return page.evaluate(async () => {
		let total = 0
		const observer = new PerformanceObserver(list => {
			for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[])
				if (!entry.hadRecentInput) total += entry.value
		})
		observer.observe({ type: 'layout-shift', buffered: true })
		for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight / 2) {
			scrollTo(0, y)
			await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))
		}
		scrollTo(0, 0)
		await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))
		observer.disconnect()
		return total
	})
}

/** Elements whose top is inside the first screen, except the last 220 px (the range of the reveal), that are not fully opaque. */
async function dimmedOnFirstScreen(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const dimmed: string[] = []
		for (const element of document.body.querySelectorAll('*')) {
			const box = element.getBoundingClientRect()
			if (box.height === 0 || box.top >= innerHeight - 220 || box.bottom <= 0) continue
			for (let node: Element | null = element; node; node = node.parentElement)
				if (Number(getComputedStyle(node).opacity) < 1 && getComputedStyle(node).display !== 'none') {
					dimmed.push(`${element.tagName.toLowerCase()}.${String(element.className).slice(0, 40)}`)
					break
				}
		}
		return dimmed
	})
}

for (const size of [SCREENS.mobile, SCREENS.chromium]) {
	test.describe(`1069 à ${size.width} px`, () => {
		test.use({ viewport: size })

		for (const path of PAGES) {
			test(`${path} : rien n’est caché au premier affichage et la mise en page ne bouge pas`, async ({ page }) => {
				await page.goto(path)
				expect(await dimmedOnFirstScreen(page)).toEqual([])
				expect(await layoutShift(page)).toBe(0)
			})
		}

		test('les blocs révélés au défilement sont tous là, entiers, une fois la page parcourue', async ({ page }) => {
			await page.goto('/a-propos')
			const blocks = page.locator('.reveal')
			expect(await blocks.count()).toBeGreaterThan(0)
			await page.evaluate(async () => {
				for (let y = 0; y <= document.documentElement.scrollHeight; y += innerHeight / 2) {
					scrollTo(0, y)
					await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))
				}
			})
			const hidden = await blocks.evaluateAll(
				elements => elements.filter(element => Number(getComputedStyle(element).opacity) < 1).length
			)
			// Every block that went by is whole.
			expect(hidden).toBe(0)
		})

		test.describe('avec un mouvement réduit', () => {
			test.use({ contextOptions: { reducedMotion: 'reduce' } })

			for (const path of PAGES) {
				test(`${path} : aucun fondu ni glissement, toute transition finit aussitôt`, async ({ page }) => {
					await page.goto(path)
					const state = await page.evaluate(() => {
						const animated: string[] = []
						const slow: string[] = []
						for (const element of document.body.querySelectorAll('*')) {
							const style = getComputedStyle(element)
							if (style.animationName !== 'none' && Number.parseFloat(style.animationDuration) > 0.001)
								animated.push(element.tagName)
							for (const duration of style.transitionDuration.split(','))
								if (Number.parseFloat(duration) > 0.001) slow.push(element.tagName)
						}
						const reveals = [...document.querySelectorAll('.reveal')].map(element => getComputedStyle(element))
						return {
							animated,
							slow,
							dimmed: reveals.filter(s => Number(s.opacity) < 1 || s.transform !== 'none').length,
						}
					})
					expect(state).toEqual({ animated: [], slow: [], dimmed: 0 })
				})
			}
		})
	})
}

test.describe('sans script', () => {
	test.use({ javaScriptEnabled: false })

	test('l’accueil et la recherche gardent leur texte dans la page, sans rien de caché par défaut', async ({ page }) => {
		for (const path of PAGES) {
			await page.goto(path)
			const text = await page.evaluate(() => document.body.innerText.length)
			expect(text).toBeGreaterThan(200)
			// No rule hides a block: the first screen is whole, and the reveal needs no script to finish.
			expect(await dimmedOnFirstScreen(page)).toEqual([])
		}
	})
})

// The profile page and a list of cards need profiles: the ones of the public profile spec, loaded once for the run and
// taken away by the last process (the two projects share them).
test.describe('1069 : une fiche et des résultats', () => {
	let profiles: ReadonlyMap<string, PageProfile>

	test.describe.configure({ mode: 'serial' })

	test.beforeAll(async () => {
		test.setTimeout(180_000)
		await users('profils-de-page', 1)
		profiles = await setPageProfiles()
	})

	test.afterAll(async () => {
		test.setTimeout(180_000)
		if ((await users('profils-de-page', -1)) > 0 || !profiles) return
		const payload = await testPayload()
		for (const { id } of profiles.values()) {
			const profile = await payload
				.findByID({ collection: 'profiles', id, depth: 0, select: { pro: true } })
				.catch(() => null)
			if (!profile) continue
			await payload.delete({ collection: 'profiles', id })
			const pro = typeof profile.pro === 'object' ? profile.pro.id : profile.pro
			if (pro !== undefined && pro !== null)
				await payload.delete({ collection: 'pros', id: pro }).catch(() => undefined)
		}
	})

	for (const size of [SCREENS.mobile, SCREENS.chromium]) {
		test.describe(`à ${size.width} px`, () => {
			test.use({ viewport: size })

			test('la fiche et la liste de cartes : premier écran entier, mise en page immobile, cartes qui montent au survol', async ({
				page,
			}) => {
				const slug = profiles.get('reference')?.slug
				expect(slug).toBeTruthy()
				await page.goto(`/profil/${slug}`)
				expect(await dimmedOnFirstScreen(page)).toEqual([])
				expect(await layoutShift(page)).toBe(0)

				await page.goto('/search?search=Page')
				const cards = page.locator('a.card-hover')
				expect(await cards.count()).toBeGreaterThan(0)
				expect(await dimmedOnFirstScreen(page)).toEqual([])
				expect(await layoutShift(page)).toBe(0)
				if (size.width > 600) {
					const card = cards.first()
					await card.scrollIntoViewIfNeeded()
					await card.hover()
					await expect.poll(() => card.evaluate(element => getComputedStyle(element).transform)).not.toBe('none')
				}
			})
		})
	}
})
