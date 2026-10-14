import { expect, test } from '@playwright/test'
import { creerCompte } from '../outils/fabrique-comptes'

/**
 * E54 (plan 02 §7.4; ticket 094): a makeup artist, logged in, never opens the admin panel.
 * Her session is a real one, the same cookie as on the site; the panel answers « unauthorized »
 * and shows nothing of the panel, not even the link to an account page.
 */
test.describe('E54 : une maquilleuse connectée n’entre pas dans l’administration', { tag: '@mobile' }, () => {
	test('l’accueil, la liste des comptes et la page du compte de l’administration lui sont refusés', async ({
		context,
		page,
	}) => {
		// The panel has an admin: with none, Payload would offer to create the first account instead.
		await creerCompte('admin')
		const maquilleuse = await creerCompte('maquilleuse')
		await context.addCookies(maquilleuse.session.cookies)

		for (const chemin of ['/admin', '/admin/collections/admins', '/admin/collections/profils', '/admin/account']) {
			await page.goto(chemin)

			await expect(page).toHaveURL(/\/admin\/unauthorized$/)
			await expect(page.locator('a[href="/admin/account"]')).toHaveCount(0)
			await expect(page.locator('a[href^="/admin/collections/"]')).toHaveCount(0)
		}
	})
})
