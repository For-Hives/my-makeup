import { expect, type Locator, type Page, test } from '@playwright/test'
import { violationsSevere } from '../support/axe'

/**
 * The navigation bar of the public site (issue 1100, docs/navbar.md), at 1440 px and 390 px: room around the entries
 * (44 px targets), one underline that slides in on hover and focus, groups that open on hover (with an intent delay)
 * and on the keyboard, a clean panel without the grey square, « Me connecter » with a single underline, reduced motion
 * that shows the state at once, and no serious accessibility violation with a group open.
 */

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navigation principale' })

/**
 * Waits for React to have hydrated the element: a pointer resting on it before is not seen as entering it once the
 * handlers are there, so the hover of a group would open nothing.
 */
const hydrated = (locator: Locator) =>
	expect
		.poll(() => locator.evaluate(element => Object.keys(element).some(key => key.startsWith('__reactProps'))))
		.toBe(true)

/**
 * Puts the timers of the page in the hands of the test. `clock.install` alone lets the time run on at its own pace, so
 * on a loaded machine the real time of the mouse moves added to `runFor` closes a group (200 ms) before the test
 * has looked at it: the clock is paused, and only `runFor` makes it move.
 */
async function handTimers(page: Page) {
	const start = new Date('2026-01-01T00:00:00Z')
	await page.clock.install({ time: start })
	await page.reload()
	await page.clock.pauseAt(new Date(start.getTime() + 1000))
}

/** Waits for the transitions and animations of the bar to end. */
const settle = (page: Page) =>
	page.evaluate(() =>
		Promise.all(
			document
				.querySelector('header')
				?.getAnimations({ subtree: true })
				.map(animation => animation.finished.catch(() => undefined)) ?? []
		)
	)

/** The underline of an entry: its text decoration, its border, and the scale of the bar it draws. */
async function underlineOf(page: Page, name: string) {
	return nav(page)
		.getByRole(name === 'Particulier' ? 'button' : 'link', { name, exact: true })
		.evaluate(element => {
			const style = getComputedStyle(element)
			const bar = getComputedStyle(element, '::after')
			return {
				decoration: style.textDecorationLine,
				border: style.borderBottomWidth,
				bar: bar.transform,
				duration: style.transitionDuration,
			}
		})
}

test.describe('Barre de navigation, sur ordinateur', () => {
	test.use({ viewport: { width: 1440, height: 900 } })
	test.beforeEach(async ({ page }) => {
		await page.goto('/')
	})

	test('chaque entrée est une cible d’au moins 44 px, avec de l’air autour du texte', async ({ page }) => {
		for (const name of ['Particulier', 'Maquilleuse', 'Solutions']) {
			const box = await nav(page).getByRole('button', { name, exact: true }).boundingBox()
			expect(box?.height, name).toBeGreaterThanOrEqual(44)
		}
		for (const name of ['Blog', 'Me connecter']) {
			const box = await nav(page).getByRole('link', { name, exact: true }).boundingBox()
			expect(box?.height, name).toBeGreaterThanOrEqual(44)
		}
		const first = await nav(page).getByRole('button', { name: 'Particulier', exact: true }).boundingBox()
		const second = await nav(page).getByRole('button', { name: 'Maquilleuse', exact: true }).boundingBox()
		expect((second?.x ?? 0) - ((first?.x ?? 0) + (first?.width ?? 0))).toBeGreaterThanOrEqual(4)
	})

	test('le survol d’une entrée fait glisser un seul soulignement et change la couleur', async ({ page }) => {
		const blog = nav(page).getByRole('link', { name: 'Blog', exact: true })
		const before = await underlineOf(page, 'Blog')
		expect(before.bar).toBe('matrix(0, 0, 0, 1, 0, 0)')
		expect(before.decoration).toBe('none')
		const colorBefore = await blog.evaluate(element => getComputedStyle(element).color)
		await blog.hover()
		await settle(page)
		const after = await underlineOf(page, 'Blog')
		expect(after.bar).toBe('matrix(1, 0, 0, 1, 0, 0)')
		expect(after.decoration).toBe('none')
		expect(await blog.evaluate(element => getComputedStyle(element).color)).not.toBe(colorBefore)
	})

	test('la page courante est entourée d’une ellipse, sans trait en plus, et les deux boutons sont des pilules de 44 px', async ({
		page,
	}) => {
		await page.goto('/blog')
		const blog = nav(page).getByRole('link', { name: 'Blog', exact: true })
		await expect(blog).toHaveAttribute('aria-current', 'page')
		await expect(blog.locator('svg')).toHaveCount(1)
		expect(await blog.evaluate(element => getComputedStyle(element, '::after').content)).toBe('none')
		for (const name of ['Trouver une maquilleuse', 'Me connecter']) {
			const link = nav(page).getByRole('link', { name, exact: true })
			const box = await link.boundingBox()
			expect(box?.height, name).toBeGreaterThanOrEqual(44)
			expect(await link.evaluate(element => getComputedStyle(element).borderTopLeftRadius), name).not.toBe('8px')
		}
	})

	test('la transition du survol dure 200 ms avec le mouvement permis', async ({ page }) => {
		const { duration } = await underlineOf(page, 'Blog')
		expect(duration).toContain('0.2s')
	})

	test('« Me connecter » : un seul soulignement, au survol et au focus', async ({ page }) => {
		const link = nav(page).getByRole('link', { name: 'Me connecter', exact: true })
		const rest = await underlineOf(page, 'Me connecter')
		expect(rest.border).toBe('0px')
		expect(rest.decoration).toBe('none')
		expect(rest.bar).toBe('matrix(0, 0, 0, 1, 0, 0)')
		await link.hover()
		await settle(page)
		const hovered = await underlineOf(page, 'Me connecter')
		expect(hovered.border).toBe('0px')
		expect(hovered.decoration).toBe('none')
		expect(hovered.bar).toBe('matrix(1, 0, 0, 1, 0, 0)')
		await page.mouse.move(2, 2)
		await link.focus()
		await page.keyboard.press('Shift')
		await settle(page)
		const focused = await underlineOf(page, 'Me connecter')
		expect(focused.decoration).toBe('none')
		expect(focused.bar).toBe('matrix(1, 0, 0, 1, 0, 0)')
	})

	test('un groupe s’ouvre au survol après un court délai, reste ouvert en traversant l’espace, se ferme en sortant', async ({
		page,
	}) => {
		// The page's timers are driven by hand: the delays are played exactly, not waited for.
		await handTimers(page)
		const trigger = nav(page).getByRole('button', { name: 'Particulier', exact: true })
		const panel = page.locator('[data-panel="Particulier"]')
		await expect(panel).toBeHidden()
		await hydrated(trigger)
		await trigger.hover()
		await page.clock.runFor(150)
		await expect(panel).toBeVisible()
		await expect(trigger).toHaveAttribute('aria-expanded', 'true')

		// Across the gap between the button and the card: it must not close on the way.
		const link = panel.getByRole('link', { name: 'Explorer les profils' })
		const from = await trigger.boundingBox()
		const to = await link.boundingBox()
		if (!from || !to) throw new Error('boîtes manquantes')
		await page.mouse.move(from.x + from.width / 2, from.y + from.height - 2)
		await page.mouse.move(to.x + 20, to.y + to.height / 2, { steps: 12 })
		await page.clock.runFor(400)
		await expect(panel).toBeVisible()

		await page.mouse.move(700, 600, { steps: 4 })
		await page.clock.runFor(100)
		await expect(panel).toBeVisible()
		await page.clock.runFor(200)
		await expect(panel).toBeHidden()
		await expect(trigger).toHaveAttribute('aria-expanded', 'false')
	})

	test('un survol qui passe sans s’arrêter n’ouvre rien', async ({ page }) => {
		await handTimers(page)
		const trigger = nav(page).getByRole('button', { name: 'Maquilleuse', exact: true })
		await hydrated(trigger)
		const box = await trigger.boundingBox()
		if (!box) throw new Error('boîte manquante')
		await page.mouse.move(box.x + box.width / 2, box.y - 30)
		await page.mouse.move(box.x + box.width / 2, box.y + 5)
		await page.mouse.move(box.x + box.width / 2, box.y - 30)
		await page.clock.runFor(400)
		await expect(page.locator('[data-panel="Maquilleuse"]')).toBeHidden()
	})

	test('le panneau est une carte propre : fond blanc, rayon, ombre, aucun carré gris au survol d’une ligne', async ({
		page,
	}) => {
		await nav(page).getByRole('button', { name: 'Solutions', exact: true }).hover()
		const panel = page.locator('[data-panel="Solutions"]')
		await expect(panel).toBeVisible()
		await settle(page)
		const card = await panel.locator('.nav-panel-card').evaluate(element => {
			const style = getComputedStyle(element)
			return { background: style.backgroundColor, radius: style.borderTopLeftRadius, shadow: style.boxShadow }
		})
		expect(card.background).toBe('rgb(255, 255, 255)')
		expect(Number.parseFloat(card.radius)).toBeGreaterThanOrEqual(8)
		expect(card.shadow).not.toBe('none')

		const row = panel.getByRole('link', { name: 'Pour les maquilleuses' })
		await row.hover()
		await settle(page)
		const hovered = await row.evaluate(element => {
			const style = getComputedStyle(element)
			return {
				background: style.backgroundColor,
				filter: style.filter,
				bar: getComputedStyle(element.querySelector('.nav-sub-title') as Element, '::after').transform,
			}
		})
		expect(hovered.background).toBe('rgba(0, 0, 0, 0)')
		expect(hovered.filter).toBe('none')
		expect(hovered.bar).toBe('matrix(1, 0, 0, 1, 0, 0)')
	})

	test('au clavier : flèche bas ouvre et entre, flèches parcourent, Échap ferme et rend le focus, Tab sort', async ({
		page,
	}) => {
		const trigger = nav(page).getByRole('button', { name: 'Particulier', exact: true })
		const panel = page.locator('[data-panel="Particulier"]')
		await trigger.focus()
		await page.keyboard.press('ArrowDown')
		await expect(panel).toBeVisible()
		const links = panel.getByRole('link')
		await expect(links.first()).toBeFocused()
		await page.keyboard.press('ArrowDown')
		await expect(links.nth(1)).toBeFocused()
		await page.keyboard.press('End')
		await expect(links.last()).toBeFocused()
		await page.keyboard.press('Home')
		await expect(links.first()).toBeFocused()
		await page.keyboard.press('ArrowUp')
		await expect(trigger).toBeFocused()
		await page.keyboard.press('ArrowDown')
		await expect(links.first()).toBeFocused()
		await page.keyboard.press('Escape')
		await expect(panel).toBeHidden()
		await expect(trigger).toBeFocused()

		// Enter opens too, and tabbing out of the group closes it.
		await page.keyboard.press('Enter')
		await expect(panel).toBeVisible()
		await nav(page).getByRole('link', { name: 'Blog', exact: true }).focus()
		await expect(panel).toBeHidden()
	})

	test('mouvement réduit : l’état du survol est visible tout de suite, sans transition', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' })
		await page.reload()
		const blog = nav(page).getByRole('link', { name: 'Blog', exact: true })
		await blog.hover()
		const state = await underlineOf(page, 'Blog')
		expect(state.bar).toBe('matrix(1, 0, 0, 1, 0, 0)')
		expect(Number.parseFloat(state.duration)).toBeLessThanOrEqual(0.00001)
		await nav(page).getByRole('button', { name: 'Particulier', exact: true }).hover()
		const animations = await page
			.locator('[data-panel="Particulier"]')
			.evaluate(element => element.getAnimations().length)
		expect(animations).toBe(0)
	})

	test('axe : aucune violation grave avec un groupe ouvert', async ({ page }) => {
		await nav(page).getByRole('button', { name: 'Particulier', exact: true }).hover()
		await expect(page.locator('[data-panel="Particulier"]')).toBeVisible()
		await settle(page)
		expect(await violationsSevere(page)).toEqual([])
	})

	test('capture à 1440 px', async ({ page }, info) => {
		await nav(page).getByRole('button', { name: 'Particulier', exact: true }).hover()
		await expect(page.locator('[data-panel="Particulier"]')).toBeVisible()
		await settle(page)
		await page.screenshot({ path: info.outputPath('navbar-1440.png'), clip: { x: 0, y: 0, width: 1440, height: 520 } })
	})
})

test.describe('Barre de navigation, sur téléphone', { tag: '@mobile' }, () => {
	test.use({ viewport: { width: 390, height: 844 } })
	test.beforeEach(async ({ page }) => {
		await page.goto('/')
	})

	test('le menu s’ouvre, les entrées sont des cibles de 44 px, un groupe se déplie sur place, rien ne déborde', async ({
		page,
	}) => {
		await page.getByRole('button', { name: 'Menu' }).click()
		for (const name of ['Particulier', 'Maquilleuse', 'Solutions']) {
			const box = await nav(page).getByRole('button', { name, exact: true }).boundingBox()
			expect(box?.height, name).toBeGreaterThanOrEqual(44)
		}
		const blog = await nav(page).getByRole('link', { name: 'Blog', exact: true }).boundingBox()
		expect(blog?.height).toBeGreaterThanOrEqual(44)
		await nav(page).getByRole('button', { name: 'Particulier', exact: true }).click()
		await expect(nav(page).getByRole('link', { name: 'Explorer les profils' })).toBeVisible()
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
		).toBeLessThanOrEqual(0)
	})

	test('axe : aucune violation grave avec le menu et un groupe ouverts', async ({ page }) => {
		await page.getByRole('button', { name: 'Menu' }).click()
		await nav(page).getByRole('button', { name: 'Maquilleuse', exact: true }).click()
		await expect(page.locator('[data-panel="Maquilleuse"]')).toBeVisible()
		await settle(page)
		expect(await violationsSevere(page)).toEqual([])
	})

	test('capture à 390 px', async ({ page }, info) => {
		await page.getByRole('button', { name: 'Menu' }).click()
		await nav(page).getByRole('button', { name: 'Particulier', exact: true }).click()
		await settle(page)
		await page.screenshot({ path: info.outputPath('navbar-390.png') })
	})
})
