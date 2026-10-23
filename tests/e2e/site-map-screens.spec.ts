import { execFileSync } from 'node:child_process'
import { expect, type Page, test } from '@playwright/test'
import { NEUTRAL_NAME } from '../../src/lib/profile/display-name'
import { setSearchProfiles } from '../fixtures/search-profiles'
import { violationsSevere } from '../support/axe'
import { ROOT } from '../support/bench'
import { SCREENS } from '../support/e2e'
import { refreshProfilePages } from '../support/public-pages'

/**
 * The plan of the site at 390 px and at 1440 px, in its three states (ticket 299): normal (every profile by her
 * real name), empty (no profile, talent or article: only the fixed pages) and error (« Un problème est survenu »).
 * On each: no horizontal scroll, every link or button at least 44 px tall, and axe finds no « serious » or
 * « critical » violation. Set `SCREENSHOT_DIR` to a folder to keep the screenshots. All made-up people.
 *
 * The normal state is the page the application serves. The empty and the error states cannot be reached without
 * emptying or breaking the database that the other tests share, so they are the real components (`SiteMapBody`
 * with no pages, `ErrorPage` with its retry button, rendered by tests/support/render-screen.tsx) put in the `main` of the page the application serves, with its
 * own style sheet and layout. That the reading throws when the database fails is tested in
 * tests/unit/site-map-names.test.ts; that the error boundary shows `ErrorPage`, in tests/unit/error-pages.test.tsx.
 */

const SIZES = [SCREENS.mobile, SCREENS.chromium] as const

async function shot(page: Page, name: string): Promise<void> {
	if (process.env.SCREENSHOT_DIR)
		await page.screenshot({
			path: `${process.env.SCREENSHOT_DIR}/299-${name}-${page.viewportSize()?.width}.png`,
			fullPage: true,
		})
}

/** The size checks of the ticket on the screen that is open. */
async function checkScreen(page: Page, label: string): Promise<void> {
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
		`${label} : défilement horizontal`
	).toBeLessThanOrEqual(0)
	const small = await page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>('main a, main button, main summary')]
			.filter(element => {
				const box = element.getBoundingClientRect()
				return box.width > 0 && box.height > 0 && box.height < 44
			})
			.map(
				element =>
					`${element.tagName} ${element.textContent?.trim().slice(0, 40)} ${Math.round(element.getBoundingClientRect().height)} px`
			)
	)
	expect(small, `${label} : cibles de moins de 44 px`).toEqual([])
	expect(await violationsSevere(page), `${label} : axe`).toEqual([])
}

/** The markup of a screen, rendered by bun (tests/support/render-screen.tsx): Playwright's Node does not read `src/`. */
const render = (screen: 'site-map-empty' | 'error-page'): string =>
	execFileSync('bun', ['--no-env-file', 'tests/support/render-screen.tsx', screen], { cwd: ROOT, encoding: 'utf8' })

/** Puts the markup of a component in the `main` of the page that is open. */
async function putInMain(page: Page, html: string): Promise<void> {
	await page.evaluate(markup => {
		const mains = document.querySelectorAll('main')
		if (mains.length !== 1) throw new Error(`${mains.length} éléments main`)
		mains[0]?.insertAdjacentHTML('afterend', markup)
		mains[0]?.remove()
	}, html)
}

for (const size of SIZES) {
	test.describe(`299 à ${size.width} px`, () => {
		test.use({ viewport: size })

		test('le plan du site : normal, chaque profil par son vrai nom', async ({ page, request }) => {
			test.setTimeout(180_000)
			const profiles = await setSearchProfiles()
			const first = profiles.get('reference')
			if (!first) throw new Error('profil de référence manquant')
			await refreshProfilePages(request, first)
			await page.goto('/site-map')
			await expect(page.getByRole('heading', { level: 1 })).toContainText('Le plan du site')
			const names = await page.locator('[data-testid="plan-des-profils"] a').allInnerTexts()
			expect(names.length).toBeGreaterThan(0)
			expect(names).not.toContain(NEUTRAL_NAME)
			await checkScreen(page, 'plan normal')
			await shot(page, 'plan-normal')
		})

		test('le plan du site : vide, les pages fixes seulement', async ({ page }) => {
			await page.goto('/site-map')
			await expect(page.getByRole('heading', { level: 1 })).toContainText('Le plan du site')
			await putInMain(page, render('site-map-empty'))
			await expect(page.getByTestId('plan-des-profils')).toHaveCount(0)
			await expect(
				page.locator('main a[href^="/profil/"], main a[href^="/talent/"], main a[href^="/blog/"]')
			).toHaveCount(0)
			expect(await page.locator('main li a').count()).toBeGreaterThan(5)
			await checkScreen(page, 'plan vide')
			await shot(page, 'plan-vide')
		})

		test('le plan du site : erreur, « Un problème est survenu » avec Réessayer', async ({ page }) => {
			await page.goto('/site-map')
			await putInMain(page, render('error-page'))
			await expect(page.getByRole('heading', { level: 1, name: 'Un problème est survenu' })).toBeVisible()
			await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible()
			await expect(page.getByRole('link', { name: "Retourner à l'accueil" })).toBeVisible()
			await checkScreen(page, 'plan en erreur')
			await shot(page, 'plan-erreur')
		})
	})
}
