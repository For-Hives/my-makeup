import { expect, type Page, test } from '@playwright/test'

/** The template of the public pages (ticket 068, E71). */

const LARGEURS = [390, 768, 1440] as const

async function debordement(page: Page): Promise<number> {
	return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

test.describe('Gabarit des pages publiques', { tag: '@mobile' }, () => {
	test('une page a sa Nav, son pied de page et son h1, sans erreur dans la console', async ({ page }) => {
		const erreurs: string[] = []
		// Next prefetches the pages the template links to (`?_rsc=`). Those that no ticket has delivered
		// yet answer 404, and the console reports it: only these prefetches are left out.
		page.on('console', message => {
			if (message.type() !== 'error') return
			if (message.location().url.includes('?_rsc=')) return
			erreurs.push(`${message.text()} ${message.location().url}`)
		})
		page.on('pageerror', erreur => erreurs.push(erreur.message))

		await page.goto('/')

		await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(1)
		await expect(page.getByRole('contentinfo')).toBeVisible()
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
		expect(erreurs).toEqual([])
	})

	test('aucune ressource d’un autre domaine, aucun débordement à 390, 768 et 1440 px', async ({ page }) => {
		const hotes = new Set<string>()
		page.on('request', requete => {
			const url = new URL(requete.url())
			if (url.protocol.startsWith('http')) hotes.add(url.host)
		})

		for (const largeur of LARGEURS) {
			await page.setViewportSize({ width: largeur, height: 900 })
			await page.goto('/')
			await expect(page.getByRole('contentinfo')).toBeVisible()
			expect(await debordement(page), `débordement à ${largeur} px`).toBeLessThanOrEqual(0)
		}

		expect([...hotes]).toEqual([new URL(page.url()).host])
	})

	// E71
	test('le menu s’ouvre, se parcourt, mène à une page et se ferme au clavier', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/')
		const bouton = page.getByRole('button', { name: 'Menu' })
		const menu = page.locator('#menu-principal')
		await expect(bouton).toHaveAttribute('aria-expanded', 'false')
		await expect(menu).toBeHidden()

		await bouton.focus()
		await page.keyboard.press('Enter')
		await expect(bouton).toHaveAttribute('aria-expanded', 'true')
		await expect(menu).toBeVisible()

		// A group unfolds with the keyboard, and Escape folds it back with the focus on its button.
		await page.keyboard.press('Tab')
		const groupe = page.getByRole('button', { name: 'Particulier' })
		await expect(groupe).toBeFocused()
		await page.keyboard.press('Enter')
		await expect(groupe).toHaveAttribute('aria-expanded', 'true')
		await expect(page.getByRole('link', { name: 'Explorer les profils' }).first()).toBeVisible()
		await page.keyboard.press('Escape')
		await expect(groupe).toHaveAttribute('aria-expanded', 'false')
		await expect(groupe).toBeFocused()

		// Escape again closes the menu and gives the focus back to its button.
		await page.keyboard.press('Escape')
		await expect(bouton).toHaveAttribute('aria-expanded', 'false')
		await expect(bouton).toBeFocused()
		await expect(menu).toBeHidden()

		// Navigation: a link of the menu leads to its page, and the menu is closed there.
		await page.keyboard.press('Enter')
		await page.getByRole('link', { name: 'Me connecter' }).click()
		// The sign-in page (ticket 074) belongs to the space, which has no public template: the menu is not there.
		await expect(page).toHaveURL(/\/auth\/signin$/)
		await expect(bouton).toHaveCount(0)
	})

	test('capture à 390 px', async ({ page }, info) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/')
		await page.getByRole('button', { name: 'Menu' }).click()
		await page.screenshot({ path: info.outputPath('gabarit-390.png'), fullPage: true })
	})
})
