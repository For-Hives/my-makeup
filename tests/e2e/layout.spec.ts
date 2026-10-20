import { expect, type Page, test } from '@playwright/test'

/** The template of the public pages (ticket 068, E71). */

const WIDTHS = [390, 768, 1440] as const

async function overflow(page: Page): Promise<number> {
	return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

test.describe('Gabarit des pages publiques', { tag: '@mobile' }, () => {
	test('une page a sa Nav, son pied de page et son h1, sans erreur dans la console', async ({ page }) => {
		const errors: string[] = []
		// Next prefetches the pages the template links to (`?_rsc=`). Those that no ticket has delivered
		// yet answer 404, and the console reports it: only these prefetches are left out.
		page.on('console', message => {
			if (message.type() !== 'error') return
			if (message.location().url.includes('?_rsc=')) return
			errors.push(`${message.text()} ${message.location().url}`)
		})
		page.on('pageerror', erreur => errors.push(erreur.message))

		await page.goto('/')

		await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(1)
		await expect(page.getByRole('contentinfo')).toBeVisible()
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
		expect(errors).toEqual([])
	})

	test('aucune ressource d’un autre domaine, aucun débordement à 390, 768 et 1440 px', async ({ page }) => {
		const hosts = new Set<string>()
		page.on('request', requete => {
			const url = new URL(requete.url())
			if (url.protocol.startsWith('http')) hosts.add(url.host)
		})

		for (const width of WIDTHS) {
			await page.setViewportSize({ width: width, height: 900 })
			await page.goto('/')
			await expect(page.getByRole('contentinfo')).toBeVisible()
			expect(await overflow(page), `débordement à ${width} px`).toBeLessThanOrEqual(0)
		}

		expect([...hosts]).toEqual([new URL(page.url()).host])
	})

	// E71
	test('le menu s’ouvre, se parcourt, mène à une page et se ferme au clavier', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/')
		const button = page.getByRole('button', { name: 'Menu' })
		const menu = page.locator('#menu-principal')
		await expect(button).toHaveAttribute('aria-expanded', 'false')
		await expect(menu).toBeHidden()

		await button.focus()
		await page.keyboard.press('Enter')
		await expect(button).toHaveAttribute('aria-expanded', 'true')
		await expect(menu).toBeVisible()

		// A group unfolds with the keyboard, and Escape folds it back with the focus on its button.
		await page.keyboard.press('Tab')
		const group = page.getByRole('button', { name: 'Particulier' })
		await expect(group).toBeFocused()
		await page.keyboard.press('Enter')
		await expect(group).toHaveAttribute('aria-expanded', 'true')
		await expect(page.getByRole('link', { name: 'Explorer les profils' }).first()).toBeVisible()
		await page.keyboard.press('Escape')
		await expect(group).toHaveAttribute('aria-expanded', 'false')
		await expect(group).toBeFocused()

		// Escape again closes the menu and gives the focus back to its button.
		await page.keyboard.press('Escape')
		await expect(button).toHaveAttribute('aria-expanded', 'false')
		await expect(button).toBeFocused()
		await expect(menu).toBeHidden()

		// Navigation: a link of the menu leads to its page, and the menu is closed there.
		await page.keyboard.press('Enter')
		await page.getByRole('link', { name: 'Me connecter' }).click()
		// The sign-in page (ticket 074) belongs to the space, which has no public template: the menu is not there.
		await expect(page).toHaveURL(/\/auth\/signin$/)
		await expect(button).toHaveCount(0)
	})

	test('capture à 390 px', async ({ page }, info) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/')
		await page.getByRole('button', { name: 'Menu' }).click()
		await page.screenshot({ path: info.outputPath('gabarit-390.png'), fullPage: true })
	})
})
