import { expect, type Page, test } from '@playwright/test'
import { type PageProfile, setPageProfiles } from '../fixtures/page-profiles'
import { SCREENS } from '../support/e2e'
import { users } from '../support/lock'
import { testPayload } from '../support/payload-test'
import { refreshProfilePages } from '../support/public-pages'

/**
 * The page transition (issue 1087, docs/mouvement.md), end to end, at 390 px and 1440 px: going from the search to a
 * profile is a client-side navigation (no reload) that the browser animates through the View Transitions API, no
 * layout shifts during it, and with reduced motion no view transition animation runs at all.
 */

/** Records the view transitions the page starts and, once one is ready, how many of its pseudo-element animations play. */
async function watchTransitions(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const state = { calls: 0, done: 0, animations: 0, shift: 0, names: [] as string[] }
		;(window as unknown as { __vt: typeof state }).__vt = state
		new PerformanceObserver(list => {
			for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[])
				if (!entry.hadRecentInput) state.shift += entry.value
		}).observe({ type: 'layout-shift', buffered: true })
		const original = document.startViewTransition?.bind(document)
		if (!original) return
		document.startViewTransition = (...args: Parameters<typeof original>) => {
			const transition = original(...args)
			state.calls++
			transition.finished.finally(() => state.done++).catch(() => undefined)
			transition.ready
				.then(() => {
					const playing = document
						.getAnimations()
						.filter(animation =>
							String((animation.effect as KeyframeEffect | null)?.pseudoElement ?? '').startsWith('::view-transition')
						)
					state.animations = Math.max(state.animations, playing.length)
					state.names.push(
						...playing.map(a => `${(a.effect as KeyframeEffect).pseudoElement}:${(a as CSSAnimation).animationName}`)
					)
				})
				.catch(() => undefined)
			return transition
		}
	})
}

const readState = (page: Page) =>
	page.evaluate(
		() =>
			(
				window as unknown as {
					__vt: { calls: number; done: number; animations: number; shift: number; names: string[] }
				}
			).__vt
	)

test.describe('1087 : transition entre la recherche et une fiche', () => {
	let profiles: ReadonlyMap<string, PageProfile>

	test.describe.configure({ mode: 'serial' })

	test.beforeAll(async () => {
		test.setTimeout(180_000)
		await users('profils-de-page', 1)
		profiles = await setPageProfiles()
	})

	// The search keeps the directory in the cache of Next, and its page without a word reads it too (the preset): a spec
	// that loads profiles with the test process has the application refresh it before it looks for them.
	test.beforeEach(async ({ request }) => {
		const first = profiles.values().next().value
		if (first) await refreshProfilePages(request, { id: first.id, specialite: null })
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

			test('la navigation reste dans la page, s’anime par la transition de vue et ne décale rien', async ({ page }) => {
				await watchTransitions(page)
				await page.goto('/search?search=Page')
				await page.evaluate(() => {
					;(window as unknown as { __kept: boolean }).__kept = true
				})
				await page.locator('article.card-hover').first().click()
				await page.waitForURL(/\/profil\//)
				await expect(page.locator('h1').first()).toBeVisible()
				// Same document: it was not a full load.
				expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true)
				// The browser of the run (Chromium) has the API.
				expect(await page.evaluate(() => 'startViewTransition' in document)).toBe(true)
				await expect.poll(async () => (await readState(page)).calls).toBeGreaterThan(0)
				await expect
					.poll(
						async () =>
							(await readState(page)).names.filter(name => name.endsWith(':page-in') || name.endsWith(':page-out'))
								.length
					)
					.toBeGreaterThanOrEqual(2)
				// The transition has ended, the page is whole and nothing moved.
				await expect
					.poll(() =>
						page.evaluate(
							() =>
								document
									.getAnimations()
									.filter(animation =>
										String((animation.effect as KeyframeEffect | null)?.pseudoElement ?? '').startsWith(
											'::view-transition'
										)
									).length
						)
					)
					.toBe(0)
				expect((await readState(page)).shift).toBe(0)
				// And back to the search: the same, in the other direction.
				await page.goBack()
				await page.waitForURL(/\/search/)
				await expect(page.locator('article.card-hover').first()).toBeVisible()
			})

			test.describe('avec un mouvement réduit', () => {
				test.use({ contextOptions: { reducedMotion: 'reduce' } })

				test('la navigation marche et aucune animation de transition de vue ne joue', async ({ page }) => {
					await watchTransitions(page)
					await page.goto('/search?search=Page')
					await page.locator('article.card-hover').first().click()
					await page.waitForURL(/\/profil\//)
					await expect(page.locator('h1').first()).toBeVisible()
					// The browser may start a transition: it ends at once, with nothing played.
					await expect.poll(async () => (await readState(page)).done).toBeGreaterThanOrEqual(1)
					const state = await readState(page)
					expect(state.names.filter(name => /:page-(in|out)$/.test(name))).toEqual([])
					expect(state.shift).toBe(0)
				})
			})
		})
	}
})
