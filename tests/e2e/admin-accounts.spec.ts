import { expect, test } from '@playwright/test'
import { createAccount } from '../support/account-factory'
import { withoutOutsideNetwork } from '../support/offline'
import { testPayload } from '../support/payload-test'

/**
 * Ticket 168 (plan 01 §6.1): the admin opens the list of the accounts, finds the ones without a profile
 * with the filter, and blocks one from its sheet: its session is closed. The bench is shared, so the
 * test looks for its own accounts by address and never counts a total.
 */

test.describe('L’admin liste les comptes et en bloque un', () => {
	test('la liste, ses trois filtres, puis le blocage depuis la fiche', async ({ context, page }, info) => {
		test.setTimeout(120_000)
		const admin = await createAccount('admin')
		const withoutProfile = await createAccount('maquilleuse-sans-profil')
		const withProfile = await createAccount('maquilleuse')
		await context.addCookies(admin.session.cookies)
		await withoutOutsideNetwork(context)
		const errors: string[] = []
		page.on('console', message => {
			if (message.type() === 'error') errors.push(message.text())
		})

		await page.goto('/admin/collections/pros?limit=200')
		const header = page.locator('thead')
		for (const column of ['Créé(e) à', 'Adresse confirmée', 'Bloqué', 'Dernière connexion', 'Profil'])
			await expect(header).toContainText(column)
		await expect(page.getByTestId('filtres-des-comptes')).toBeVisible()
		for (const key of ['non-confirmes', 'sans-profil', 'bloques'])
			await expect(page.getByTestId(`filtre-${key}`)).toBeVisible()

		// Without a profile: the filter keeps the account that has none and drops the other.
		await page.getByTestId('filtre-sans-profil').click()
		await expect(page).toHaveURL(/where.*id.*not_in/)
		const lineWithout = page.locator('tbody tr', { hasText: withoutProfile.email })
		await expect(lineWithout).toHaveCount(1)
		await expect(lineWithout).toContainText('Non')
		await expect(page.locator('tbody tr', { hasText: withProfile.email })).toHaveCount(0)
		await page.screenshot({ path: info.outputPath('liste-des-comptes.png') })
		// The filters stay readable on a phone (docs/qualite.md, §4): the links wrap, none is cut off.
		await page.setViewportSize({ width: 390, height: 844 })
		for (const key of ['non-confirmes', 'sans-profil', 'bloques'])
			await expect(page.getByTestId(`filtre-${key}`)).toBeInViewport()
		await page.screenshot({ path: info.outputPath('liste-des-comptes-390.png') })
		await page.setViewportSize({ width: 1440, height: 900 })

		// Block from the sheet: tick the box, save, the account is blocked and its session closed.
		const account = await createAccount('maquilleuse')
		await page.goto(`/admin/collections/pros/${account.id}`)
		const case_ = page.locator('#field-blocked')
		await expect(async () => {
			await case_.check({ timeout: 2_000 })
			await expect(case_).toBeChecked({ timeout: 2_000 })
		}).toPass({ timeout: 20_000 })
		await page.locator('#action-save').click()
		await expect(page.getByText('Mis à jour avec succès').first()).toBeVisible()
		const payload = await testPayload()
		expect((await payload.findByID({ collection: 'pros', id: account.id, depth: 0 })).blocked).toBe(true)
		const me = await payload.auth({ headers: new Headers(account.session.enTetes) })
		expect(me.user).toBeNull()

		expect(errors.filter(texte => !texte.includes('favicon'))).toEqual([])
	})
})
