import { expect, test } from '@playwright/test'
import { creerCompte } from '../support/account-factory'

/**
 * The shell test of the end-to-end bench: the smallest test that goes through everything a
 * later test relies on. A real browser opens the local application, at both screen sizes, and
 * a session made by the account factory is accepted by the application itself: same database,
 * same secret, same origin.
 *
 * The admin panel is written by Payload: it is found by its addresses and by the address of the
 * account, never by a label. Its language, French, is checked in administration-francais.spec.ts.
 */
test.describe('Essai coquille : le site local, déjà connecté', { tag: '@mobile' }, () => {
	test('l’accueil s’ouvre, puis l’administration avec une session de la fabrique', async ({ context, page }) => {
		await page.goto('/')
		await expect(
			page.getByRole('heading', {
				level: 1,
				name: "Trouver la maquilleuse qui vous correspond n'a jamais été aussi simple",
			})
		).toBeVisible()

		// Nobody types a password: the factory gives the cookie of a session that is already open.
		const compte = await creerCompte('admin')
		await context.addCookies(compte.session.cookies)

		await page.goto('/admin')
		const lienDuCompte = page.locator('a[href="/admin/account"]')
		await expect(lienDuCompte).toBeVisible()
		await expect(page).toHaveURL(/\/admin$/)

		// The account page says whose session it is.
		await lienDuCompte.click()
		await expect(page.getByRole('heading', { level: 1, name: compte.email })).toBeVisible()
		await expect(page).toHaveURL(/\/admin\/account$/)
	})

	test('sans session, l’administration renvoie à sa page de connexion', async ({ page }) => {
		// With no account at all, Payload would offer to create the first one instead.
		await creerCompte('admin')

		await page.goto('/admin')

		await expect(page).toHaveURL(/\/admin\/login(?:\?|$)/)
		await expect(page.locator('a[href="/admin/account"]')).toHaveCount(0)
	})
})
