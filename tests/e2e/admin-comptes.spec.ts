import { expect, test } from '@playwright/test'
import { creerCompte } from '../outils/fabrique-comptes'
import { sansLeReseauDuDehors } from '../outils/hors-reseau'
import { payloadDeTest } from '../outils/payload-test'

/**
 * Ticket 168 (plan 01 §6.1): the admin opens the list of the accounts, finds the ones without a profile
 * with the filter, and blocks one from its sheet: its session is closed. The bench is shared, so the
 * test looks for its own accounts by address and never counts a total.
 */

test.describe('L’admin liste les comptes et en bloque un', () => {
	test('la liste, ses trois filtres, puis le blocage depuis la fiche', async ({ context, page }, info) => {
		test.setTimeout(120_000)
		const admin = await creerCompte('admin')
		const sansProfil = await creerCompte('maquilleuse-sans-profil')
		const avecProfil = await creerCompte('maquilleuse')
		await context.addCookies(admin.session.cookies)
		await sansLeReseauDuDehors(context)
		const erreurs: string[] = []
		page.on('console', message => {
			if (message.type() === 'error') erreurs.push(message.text())
		})

		await page.goto('/admin/collections/pros?limit=200')
		const entete = page.locator('thead')
		for (const colonne of ['Créé(e) à', 'Adresse confirmée', 'Bloqué', 'Dernière connexion', 'Profil'])
			await expect(entete).toContainText(colonne)
		await expect(page.getByTestId('filtres-des-comptes')).toBeVisible()
		for (const cle of ['non-confirmes', 'sans-profil', 'bloques'])
			await expect(page.getByTestId(`filtre-${cle}`)).toBeVisible()

		// Without a profile: the filter keeps the account that has none and drops the other.
		await page.getByTestId('filtre-sans-profil').click()
		await expect(page).toHaveURL(/where.*id.*not_in/)
		const ligneSans = page.locator('tbody tr', { hasText: sansProfil.email })
		await expect(ligneSans).toHaveCount(1)
		await expect(ligneSans).toContainText('Non')
		await expect(page.locator('tbody tr', { hasText: avecProfil.email })).toHaveCount(0)
		await page.screenshot({ path: info.outputPath('liste-des-comptes.png') })
		// The filters stay readable on a phone (docs/qualite.md, §4): the links wrap, none is cut off.
		await page.setViewportSize({ width: 390, height: 844 })
		for (const cle of ['non-confirmes', 'sans-profil', 'bloques'])
			await expect(page.getByTestId(`filtre-${cle}`)).toBeInViewport()
		await page.screenshot({ path: info.outputPath('liste-des-comptes-390.png') })
		await page.setViewportSize({ width: 1440, height: 900 })

		// Block from the sheet: tick the box, save, the account is blocked and its session closed.
		const compte = await creerCompte('maquilleuse')
		await page.goto(`/admin/collections/pros/${compte.id}`)
		const case_ = page.locator('#field-blocked')
		await expect(async () => {
			await case_.check({ timeout: 2_000 })
			await expect(case_).toBeChecked({ timeout: 2_000 })
		}).toPass({ timeout: 20_000 })
		await page.locator('#action-save').click()
		await expect(page.getByText('Mis à jour avec succès').first()).toBeVisible()
		const payload = await payloadDeTest()
		expect((await payload.findByID({ collection: 'pros', id: compte.id, depth: 0 })).blocked).toBe(true)
		const moi = await payload.auth({ headers: new Headers(compte.session.enTetes) })
		expect(moi.user).toBeNull()

		expect(erreurs.filter(texte => !texte.includes('favicon'))).toEqual([])
	})
})
