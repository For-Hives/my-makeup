import { expect, type Page, test } from '@playwright/test'
import { type PageProfile, setPageProfiles } from '../fixtures/page-profiles'
import { createAccount } from '../support/account-factory'
import { SCREENS } from '../support/e2e'
import { users } from '../support/lock'
import { testPayload } from '../support/payload-test'
import { createContent, deleteContent } from '../support/public-pages'

/**
 * The motion system (issue 1069, docs/mouvement.md), end to end, at 390 px and 1440 px: the first screen is never
 * hidden at first paint (the LCP element is whole at the very first frame of the load-in), the layout never shifts
 * (CLS 0) and never scrolls sideways while the whole page is scrolled, the content is in the page without script, a
 * block below the fold is revealed once when it comes into view, and with reduced motion nothing slides or fades
 * and every transition ends at once.
 */

/** The pages of the first system (issue 1069), then those of issue 1088: the blog, the ranking, the contact page, the sign-in and the sign-up. */
const PAGES = ['/', '/search', '/a-propos', '/blog', '/classement', '/contact', '/auth/signin', '/auth/signup']

/** The pages whose blocks are revealed by the scroll, and that hold at least one (the forms of the sign-in fit the first screen). */
const REVEALED_PAGES = ['/a-propos', '/blog', '/classement', '/contact']

/** Scrolls the page through, half a screen at a time, and comes back to the top. */
async function scrollThrough(page: Page): Promise<void> {
	await page.evaluate(async () => {
		for (let y = 0; y <= document.documentElement.scrollHeight; y += innerHeight / 2) {
			scrollTo(0, y)
			await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))
		}
	})
	await settle(page)
}

/** How many `.reveal` blocks of the page are not whole (faded or shifted) right now. */
const notWhole = (page: Page): Promise<number> =>
	page
		.locator('.reveal')
		.evaluateAll(elements => elements.filter(element => Number(getComputedStyle(element).opacity) < 1).length)

/** Waits for every animation and transition of the page to end (the load-in, the reveals): the page is then at rest. */
function settle(page: Page): Promise<void> {
	return page.evaluate(async () => {
		// The loops of the kit (the sliding banner, the turning badge) never finish: they are not part of a load-in.
		const finite = document
			.getAnimations()
			.filter(animation => animation.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
		await Promise.all(finite.map(animation => animation.finished.catch(() => undefined)))
	})
}

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

/** Elements whose top is inside the first screen that are not fully opaque once the load-in is over. */
async function dimmedOnFirstScreen(page: Page): Promise<string[]> {
	await settle(page)
	return page.evaluate(() => {
		const dimmed: string[] = []
		for (const element of document.body.querySelectorAll('*')) {
			const box = element.getBoundingClientRect()
			if (box.height === 0 || box.top >= innerHeight || box.bottom <= 0) continue
			// A glow of the kit is a translucent light on purpose (decoration, never text): it is not a block that waits.
			if (element.closest('.art-glow')) continue
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

		for (const path of REVEALED_PAGES) {
			test(`${path} : les blocs révélés au défilement sont tous là, entiers, une fois la page parcourue`, async ({
				page,
			}) => {
				await page.goto(path)
				expect(await page.locator('.reveal').count()).toBeGreaterThan(0)
				await scrollThrough(page)
				// Every block that went by is whole.
				expect(await notWhole(page)).toBe(0)
			})
		}

		for (const path of PAGES) {
			test(`${path} : à la première image de l’entrée, l’élément du LCP est entier (jamais à opacité 0)`, async ({
				page,
			}) => {
				await page.addInitScript(() => {
					new PerformanceObserver(list => {
						for (const entry of list.getEntries())
							(window as unknown as { __lcp?: Element }).__lcp = (entry as unknown as { element: Element }).element
					}).observe({ type: 'largest-contentful-paint', buffered: true })
				})
				await page.goto(path)
				await settle(page)
				const state = await page.evaluate(() => {
					// Play the load-in again and hold it on its very first frame: what a first paint shows.
					for (const element of document.querySelectorAll<HTMLElement>('.enter, .enter-fade, .enter-mask')) {
						const names = [...element.classList].filter(name => name.startsWith('enter'))
						element.classList.remove(...names)
						void element.offsetWidth
						element.classList.add(...names)
					}
					for (const animation of document.getAnimations()) {
						animation.pause()
						animation.currentTime = 0
					}
					const lcp = (window as unknown as { __lcp?: Element }).__lcp
					const chain: number[] = []
					for (let node: Element | null = lcp ?? null; node; node = node.parentElement)
						chain.push(Number(getComputedStyle(node).opacity))
					return {
						hasLcp: Boolean(lcp),
						lcpFaded: chain.some(opacity => opacity < 1),
						// Only a block without text of its own may fade (the form card, the drawing): never what holds the LCP.
						insideFade: lcp
							? [...document.querySelectorAll('.enter-fade')].some(element => element.contains(lcp))
							: false,
						textFaded: [...document.querySelectorAll('.enter, .enter-mask')].filter(
							element => Number(getComputedStyle(element).opacity) < 1
						).length,
					}
				})
				expect(state).toEqual({ hasLcp: true, lcpFaded: false, insideFade: false, textFaded: 0 })
			})

			test(`${path} : aucun défilement latéral, ni à la première image, ni en cours d’entrée, ni la page parcourue`, async ({
				page,
			}) => {
				await page.goto(path)
				await settle(page)
				const widths = await page.evaluate(async () => {
					const wide = () => document.documentElement.scrollWidth > innerWidth
					const seen: boolean[] = []
					for (const time of [0, 200, 450]) {
						for (const element of document.querySelectorAll<HTMLElement>('.enter, .enter-fade, .enter-mask')) {
							const names = [...element.classList].filter(name => name.startsWith('enter'))
							element.classList.remove(...names)
							void element.offsetWidth
							element.classList.add(...names)
						}
						for (const animation of document.getAnimations()) {
							animation.pause()
							animation.currentTime = time
						}
						seen.push(wide())
					}
					return seen
				})
				expect(widths).toEqual([false, false, false])
				await page.reload()
				await scrollThrough(page)
				expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
			})
		}

		test('/classement : un bloc sous la ligne de flottaison est caché, puis monte une seule fois à l’entrée dans l’écran', async ({
			page,
		}) => {
			await page.goto('/classement')
			const waiting = page.locator('.reveal[data-reveal="wait"]')
			await expect.poll(() => waiting.count()).toBeGreaterThan(0)
			await waiting.last().evaluate(element => element.setAttribute('data-probe', 'reveal'))
			const block = page.locator('[data-probe="reveal"]')
			const read = () =>
				block.evaluate(element => {
					const style = getComputedStyle(element)
					return {
						opacity: Number(style.opacity),
						transform: style.transform,
						shift: new DOMMatrix(style.transform).m42,
						duration: style.transitionDuration,
					}
				})
			// Hidden, shifted by 28 px.
			const before = await read()
			expect(before.opacity).toBe(0)
			expect(before.shift).toBeCloseTo(28, 0)
			await block.evaluate(element => element.scrollIntoView({ block: 'center' }))
			await expect(block).toHaveAttribute('data-reveal', 'in')
			expect((await read()).duration).toBe('0.6s, 0.6s')
			await settle(page)
			const after = await read()
			expect(after.opacity).toBe(1)
			expect(after.transform).toBe('none')
			// Once: scrolled away and back, it stays where it is and nothing plays again.
			await page.evaluate(() => scrollTo(0, 0))
			await block.evaluate(element => element.scrollIntoView({ block: 'center' }))
			await expect(block).toHaveAttribute('data-reveal', 'in')
			expect(await block.evaluate(element => element.getAnimations().length)).toBe(0)
			expect((await read()).opacity).toBe(1)
		})

		test('/classement : les blocs du haut de page ne sont jamais cachés ni décalés', async ({ page }) => {
			await page.goto('/classement')
			await expect.poll(() => page.locator('.reveal[data-reveal]').count()).toBeGreaterThan(0)
			const firstScreen = await page.locator('.reveal[data-reveal="seen"]').evaluateAll(elements =>
				elements.map(element => ({
					top: element.getBoundingClientRect().top,
					opacity: getComputedStyle(element).opacity,
				}))
			)
			for (const { top, opacity } of firstScreen) {
				expect(top).toBeLessThan(size.height)
				expect(opacity).toBe('1')
			}
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

			test('/classement : aucun bloc n’attend ni ne se décale, même la page parcourue', async ({ page }) => {
				await page.goto('/classement')
				await scrollThrough(page)
				expect(await page.locator('.reveal[data-reveal="wait"]').count()).toBe(0)
				const moving = await page.locator('.reveal').evaluateAll(
					elements =>
						elements.filter(element => {
							const style = getComputedStyle(element)
							return Number(style.opacity) < 1 || style.transform !== 'none'
						}).length
				)
				expect(moving).toBe(0)
			})
		})
	})
}

test.describe('sans script', () => {
	test.use({ javaScriptEnabled: false })

	test('les pages publiques et les écrans de connexion gardent leur texte dans la page, sans rien de caché par défaut', async ({
		page,
	}) => {
		for (const path of PAGES) {
			await page.goto(path)
			const text = await page.evaluate(() => document.body.innerText.length)
			// The forms of the sign-in and the sign-up say little: their text is still there.
			expect(text).toBeGreaterThan(path.startsWith('/auth/') ? 40 : 200)
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
					// It rises slowly (400 ms), and its photo grows as slowly.
					expect(await card.evaluate(element => getComputedStyle(element).transitionDuration)).toContain('0.4s')
					expect(
						await card
							.locator('.card-zoom')
							.first()
							.evaluate(element => getComputedStyle(element).transitionDuration)
					).toBe('0.4s')
				}
			})
		})
	}
})

// The page of a talent and « Mon espace » (issue 1088) need a document and a signed-in account: made here, taken away after.
test.describe('1088 : un talent et « Mon espace »', () => {
	const suffix = Date.now().toString(36)
	const content: { id: number }[] = []
	const accounts: number[] = []
	let talent = ''

	test.describe.configure({ mode: 'serial' })

	test.beforeAll(async ({ request }) => {
		test.setTimeout(180_000)
		talent = `essai-mouvement-${suffix}`
		content.push({
			id: await createContent(request, 'talents', {
				title: `Talent ${suffix}`,
				slug: talent,
				pageTitle: 'Maquillage fictif : une maquilleuse près de chez vous',
				description: 'Une présentation écrite pour l’essai du mouvement.',
				content: '# Un titre du texte\n\nUn paragraphe avec du **gras**.\n',
				_status: 'published',
			}),
		})
	})

	test.afterAll(async ({ request }) => {
		test.setTimeout(180_000)
		for (const { id } of content) await deleteContent(request, 'talents', id)
		const payload = await testPayload()
		for (const account of accounts.splice(0)) {
			const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account } } })
			for (const { id } of docs) await payload.delete({ collection: 'profiles', id }).catch(() => undefined)
			await payload.delete({ collection: 'pros', id: account }).catch(() => undefined)
		}
	})

	for (const size of [SCREENS.mobile, SCREENS.chromium]) {
		test.describe(`à ${size.width} px`, () => {
			test.use({ viewport: size })

			test('le talent : premier écran entier, mise en page immobile, blocs entiers une fois la page parcourue', async ({
				page,
			}) => {
				await page.goto(`/talent/${talent}`)
				expect(await dimmedOnFirstScreen(page)).toEqual([])
				expect(await layoutShift(page)).toBe(0)
				expect(await page.locator('.reveal').count()).toBeGreaterThan(0)
				await scrollThrough(page)
				expect(await notWhole(page)).toBe(0)
			})

			for (const reduced of [false, true]) {
				test.describe(reduced ? 'avec un mouvement réduit' : 'avec le mouvement par défaut', () => {
					test.use({ contextOptions: { reducedMotion: reduced ? 'reduce' : 'no-preference' } })

					test('« Mon espace » : premier écran entier, mise en page immobile, cartes entières', async ({
						context,
						page,
					}) => {
						const account = await createAccount('maquilleuse')
						accounts.push(Number(account.id))
						await context.addCookies(account.session.cookies)
						await page.goto('/auth/profil')
						expect(await page.locator('.reveal').count()).toBeGreaterThan(0)
						expect(await dimmedOnFirstScreen(page)).toEqual([])
						// Not 0 here: the fonts of her space (next/font, swapped in with a size-adjusted fallback) move the text by
						// 0.0016 on CI, with or without motion. A reveal moves nothing (transform), so a real shift would be far above.
						expect(await layoutShift(page)).toBeLessThan(0.005)
						await scrollThrough(page)
						expect(await notWhole(page)).toBe(0)
						if (reduced) {
							const moving = await page.evaluate(
								() =>
									[...document.querySelectorAll('.reveal')].filter(element => {
										const style = getComputedStyle(element)
										return style.transform !== 'none' || Number.parseFloat(style.animationDuration) > 0.001
									}).length
							)
							expect(moving).toBe(0)
						}
					})
				})
			}
		})
	}
})
