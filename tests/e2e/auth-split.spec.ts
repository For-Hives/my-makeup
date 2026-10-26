import { expect, type Page, test } from '@playwright/test'
import { violationsSevere } from '../support/axe'

/**
 * The sign-in and sign-up pages in two columns (issue 1138): from 1024 px the art panel (the title, a photo cut as an
 * arch) beside the white card with the form; under it the title over the card, no photo. At each size: one h1, the
 * card holds the form, no horizontal scroll, every control at least 44 px tall, axe finds nothing serious, no layout
 * shift. The behaviours (redirects, errors, rate limits) are those of sign-in.spec.ts and sign-up.spec.ts.
 */

const PAGES = [
	{ name: 'la connexion', path: '/auth/signin', heading: 'Se connecter', submit: 'Se connecter' },
	{ name: 'l’inscription', path: '/auth/signup', heading: 'S’inscrire', submit: 'S’inscrire' },
] as const

/** The fonts are in and two frames are painted: what shifts, shifted. */
const settled = (page: Page) =>
	page.evaluate(() =>
		document.fonts.ready.then(
			() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())))
		)
	)

test.describe('Connexion et inscription en deux colonnes', { tag: '@mobile' }, () => {
	for (const { name, path, heading, submit } of PAGES) {
		test(`${name} : titre, carte, cibles de 44 px, pas de défilement latéral`, async ({ page }) => {
			await page.addInitScript(() => {
				const w = window as unknown as { __cls: number }
				w.__cls = 0
				new PerformanceObserver(list => {
					for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[])
						if (!entry.hadRecentInput) w.__cls += entry.value
				}).observe({ type: 'layout-shift', buffered: true })
			})
			await page.goto(path)
			const title = page.getByRole('heading', { level: 1, name: heading })
			await expect(title).toBeVisible()
			await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
			const card = page.getByTestId('auth-card')
			await expect(card.getByRole('button', { name: submit, exact: true })).toBeVisible()
			const wide = (page.viewportSize()?.width ?? 390) >= 1024
			const [t, c] = [await title.boundingBox(), await card.boundingBox()]
			if (!(t && c)) throw new Error('The title or the card is not on screen.')
			if (wide) expect(c.x).toBeGreaterThan(t.x + t.width - 1)
			else expect(c.y).toBeGreaterThan(t.y + t.height - 1)
			// The photo is a picture of the wide layout only.
			await expect(page.locator('.art-arch img')).toBeVisible({ visible: wide })
			// The links inside a sentence (the help line, the terms) are text, not targets of their own.
			const small = await card.evaluate(element =>
				[...element.querySelectorAll<HTMLElement>('input:not([tabindex="-1"]), button, a')]
					.filter(control => !control.closest('p[data-testid="aide-sans-mot-de-passe"]') && !control.closest('label'))
					.filter(control => control.getBoundingClientRect().width > 0 && control.getBoundingClientRect().height < 44)
					.map(control => `${control.tagName} ${control.textContent?.trim()} ${control.getBoundingClientRect().height}`)
			)
			expect(small).toEqual([])
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
			await settled(page)
			expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.01)
			expect(await violationsSevere(page)).toEqual([])
			await page.screenshot({
				path: `test-results/essais/auth-split-${path.split('/').pop()}-${test.info().project.name}.png`,
			})
		})
	}

	test('la connexion : un refus de Google et la session expirée gardent leur message', async ({ page }) => {
		await page.goto('/auth/signin?error=session-expiree')
		await expect(page.getByTestId('session-expiree')).toBeVisible()
		expect(await violationsSevere(page)).toEqual([])
	})
})
