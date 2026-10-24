import { expect, test } from '@playwright/test'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { block, checkScreen, editHarness, pen, SIZES, shot as shotOf } from '../support/direct-edit-e2e'
import { testPayload } from '../support/payload-test'

/**
 * Coordonnées of her own page in edit mode (issue 1020), at 390 px and at 1440 px: the normal, hover,
 * empty, editing and error states; the consent withdrawn takes the phone and the email off the public
 * page at the next visit (the visitor's page is read after the save) and the dated choice is set by the
 * server; no horizontal scroll, targets of 44 px, no serious axe violation.
 */

const shot = (page: Parameters<typeof shotOf>[0], name: string) => shotOf(page, '1020', name)
const PEN = 'Modifier mes coordonnées'
const PHONE = '06 39 98 10 01'

for (const size of SIZES) {
	test.describe(`1020 à ${size.width} px`, () => {
		test.use({ viewport: { width: size.width, height: size.height }, hasTouch: size.touch })
		test.describe.configure({ timeout: 120_000 })
		const { open } = editHarness(size)

		test('l’état normal : le bloc est un bouton, aucune erreur d’accessibilité', async ({ context, page }) => {
			await open(page, context, 'reference')
			await expect(pen(page, PEN)).toBeVisible()
			await checkScreen(page, 'normal')
			await shot(page, 'normal')
		})

		test('le survol (ou le focus clavier) montre qu’on peut modifier', async ({ context, page }) => {
			await open(page, context, 'reference')
			const contacts = block(page, 'contacts')
			await contacts.scrollIntoViewIfNeeded()
			const label = contacts.getByText('Modifier', { exact: true })
			await expect(label).toBeHidden()
			if (size.touch) await pen(page, PEN).focus()
			else await contacts.hover()
			await expect(label).toBeVisible()
			await shot(page, 'survol')
		})

		test('l’état vide : des coordonnées cachées sont dites au lieu d’un bloc muet', async ({ context, page }) => {
			await open(page, context, 'sans-contact-public')
			await expect(
				page.locator('[data-direct-edit-empty]').filter({ hasText: 'Tes coordonnées ne s’affichent pas.' })
			).toBeVisible()
			await checkScreen(page, 'vide')
			await shot(page, 'vide')
		})

		test('retirer son consentement : la page publique perd le téléphone et l’email, le choix est daté ensuite', async ({
			context,
			page,
			request,
		}) => {
			const profile = await open(page, context, 'reference')
			const payload = await testPayload()
			const email =
				(await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })).contactDetails?.email ?? ''
			expect(email).not.toBe('')
			const visible = await (await request.get(`/profil/${profile.slug}`)).text()
			expect(visible).toContain(PHONE)
			expect(visible).toContain(email)
			await pen(page, PEN).click()
			await expect(page.locator('[data-direct-edit-editor]')).toContainText('Tu modifies : Coordonnées')
			await expect(page.locator('#direct-contacts-phone')).toBeFocused()
			await page.getByLabel('Afficher mon téléphone et mon email sur ma page').uncheck()
			await checkScreen(page, 'édition')
			await shot(page, 'edition')
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant')
			const hidden = await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })
			expect(hidden.publicContact).toBe(false)
			expect(hidden.consentedAt ?? null).toBeNull()
			// The visitor's page, read after the save, shows neither the phone nor the email.
			const html = await (await request.get(`/profil/${profile.slug}`)).text()
			expect(html).not.toContain(PHONE)
			expect(html).not.toContain(email)
			// The block says so on her own page, and the button « Contacter » leaves with the details shown.
			await expect(page.getByText('Tes coordonnées ne s’affichent pas.')).toBeVisible()
			// She chooses again: the server dates it.
			await pen(page, PEN).click()
			await page.getByLabel('Afficher mon téléphone et mon email sur ma page').check()
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant')
			const shown = await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })
			expect(shown.publicContact).toBe(true)
			expect(typeof shown.consentedAt).toBe('string')
		})

		test('un numéro invalide est dit sous le champ, et l’erreur de réseau garde la saisie', async ({
			context,
			page,
		}) => {
			const profile = await open(page, context, 'reference')
			await pen(page, PEN).click()
			await page.locator('#direct-contacts-phone').fill('abc')
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByText('Ce numéro n’est pas valide')).toBeVisible()
			await page.locator('#direct-contacts-phone').fill('06 12 00 00 00')
			const cut = (route: {
				request: () => { method: () => string }
				abort: () => Promise<void>
				continue: () => Promise<void>
			}) => (route.request().method() === 'POST' ? route.abort() : route.continue())
			await page.route('**/auth/apercu-profil**', cut)
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByRole('alert').filter({ hasText: FAILURE_MESSAGE })).toBeVisible()
			await expect(page.locator('#direct-contacts-phone')).toHaveValue('06 12 00 00 00')
			await checkScreen(page, 'erreur')
			await shot(page, 'erreur')
			await page.unroute('**/auth/apercu-profil**', cut)
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant')
			const payload = await testPayload()
			expect((await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })).contactDetails?.phone).toBe(
				'06 12 00 00 00'
			)
		})

		test('la page publique ne porte aucun contrôle d’édition', async ({ context, page, request }) => {
			const profile = await open(page, context, 'reference')
			const html = await (await request.get(`/profil/${profile.slug}`)).text()
			expect(html).not.toContain('data-direct-edit')
			expect(html).not.toContain(PEN)
		})
	})
}
