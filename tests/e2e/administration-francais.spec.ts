import { expect, test } from '@playwright/test'
import { creerCompte } from '../support/account-factory'

/**
 * The admin panel speaks French (ticket 221; src/lib/payload-language.ts). Payload offers no other
 * language, so a browser set to English, which asks for English in every request, gets French too.
 */
test.describe('L’administration s’affiche en français', { tag: '@mobile' }, () => {
	test.use({ locale: 'en-US' })

	test('l’écran de connexion est en français, même pour un navigateur réglé en anglais', async ({ page }, testInfo) => {
		// With no account at all, Payload would offer to create the first one instead.
		await creerCompte('admin')

		await page.goto('/admin/login')

		await expect(page).toHaveURL(/\/admin\/login(?:\?|$)/)
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
		await expect(page).toHaveTitle(/Se connecter/)
		await expect(page.getByLabel('E-mail')).toBeVisible()
		await expect(page.getByLabel('Mot de passe', { exact: false }).first()).toBeVisible()
		await expect(page.getByRole('link', { name: /Mot de passe oublié/ })).toBeVisible()
		await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible()
		// Nothing of Payload's English is left on the screen.
		for (const anglais of ['Login', 'Password', 'Forgot password'])
			await expect(page.getByText(anglais, { exact: false })).toHaveCount(0)

		await testInfo.attach(`connexion-${testInfo.project.name}`, {
			body: await page.screenshot({ fullPage: true }),
			contentType: 'image/png',
		})
	})

	// Ticket 223, constat 5: no avatar from gravatar.com, which would receive a fingerprint of the admin's email.
	test('l’administration ne demande aucune image à gravatar.com', async ({ context, page }) => {
		const admin = await creerCompte('admin')
		await context.addCookies(admin.session.cookies)
		const demandes: string[] = []
		page.on('request', requete => void demandes.push(requete.url()))

		await page.goto('/admin')
		await expect(page.getByRole('button', { name: 'Collections' })).toBeVisible()
		await page.waitForLoadState('networkidle')

		expect(demandes.length).toBeGreaterThan(0)
		expect(demandes.filter(adresse => /gravatar\.com/i.test(adresse))).toEqual([])
	})
})
