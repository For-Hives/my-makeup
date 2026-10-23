import { expect, test } from '@playwright/test'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { block, checkScreen, editHarness, pen, SIZES, shot as shotOf } from '../support/direct-edit-e2e'
import { testPayload } from '../support/payload-test'

/**
 * Prestations et tarifs of her own page in edit mode (issue 1017), at 390 px and at 1440 px: the normal,
 * hover, empty, editing and error states; one button adds the row and saves the list; free prices;
 * no horizontal scroll, targets of 44 px, no serious axe violation; a visitor's page without controls.
 */

const shot = (page: Parameters<typeof shotOf>[0], name: string) => shotOf(page, '1017', name)
const PEN = 'Modifier mes prestations'

for (const size of SIZES) {
	test.describe(`1017 à ${size.width} px`, () => {
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
			const services = block(page, 'services')
			await services.scrollIntoViewIfNeeded()
			const label = services.getByText('Modifier', { exact: true })
			await expect(label).toBeHidden()
			if (size.touch) await pen(page, PEN).focus()
			else await services.hover()
			await expect(label).toBeVisible()
			await shot(page, 'survol')
		})

		test('l’état vide : le bloc reste sur la page et dit quoi faire', async ({ context, page }) => {
			await open(page, context, 'vide')
			await expect(
				page.locator('[data-direct-edit-empty]').filter({ hasText: 'Ajoute tes prestations et tes tarifs.' })
			).toBeVisible()
			await checkScreen(page, 'vide')
			await shot(page, 'vide')
		})

		test('un seul bouton ajoute la prestation et enregistre la liste ; le prix libre et les options partent', async ({
			context,
			page,
		}) => {
			const profile = await open(page, context, 'reference')
			await pen(page, PEN).click()
			await page.getByRole('button', { name: 'Ajouter une prestation' }).click()
			await page.getByRole('button', { name: 'Modèle Soirée' }).click()
			await expect(page.getByLabel('Nom de la prestation')).toHaveValue('Maquillage de soirée')
			await page.getByLabel('Prix', { exact: true }).fill('à partir de 70')
			await expect(page.getByText('Montant retenu pour ton profil')).toBeVisible()
			await page.getByRole('button', { name: 'Ajouter une option (ex. essai, retouches)' }).click()
			await page.getByLabel('Nom', { exact: true }).fill('Retouches')
			await page.getByLabel('Prix de l’option').fill('sur devis')
			await checkScreen(page, 'édition')
			await shot(page, 'edition')
			await page.getByRole('button', { name: 'Enregistrer cette prestation' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant')
			const payload = await testPayload()
			const stored = await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })
			const added = stored.serviceOffers?.find(offer => offer.name === 'Maquillage de soirée')
			expect(added?.priceFrom).toBe(70)
			expect(added?.priceText).toBe('à partir de 70')
			expect(added?.options?.[0]?.name).toBe('Retouches')
			expect(added?.options?.[0]?.priceText).toBe('sur devis')
			expect(added?.options?.[0]?.priceFrom ?? null).toBeNull()
		})

		test('l’erreur : un réseau coupé est dit en français, la saisie reste, puis l’enregistrement passe', async ({
			context,
			page,
		}) => {
			const profile = await open(page, context, 'reference')
			await pen(page, PEN).click()
			await page.getByRole('button', { name: 'Ajouter une prestation' }).click()
			await page.getByLabel('Nom de la prestation').fill('Maquillage shooting')
			const cut = (route: {
				request: () => { method: () => string }
				abort: () => Promise<void>
				continue: () => Promise<void>
			}) => (route.request().method() === 'POST' ? route.abort() : route.continue())
			await page.route('**/auth/apercu-profil**', cut)
			await page.getByRole('button', { name: 'Enregistrer cette prestation' }).click()
			await expect(page.getByRole('alert').filter({ hasText: FAILURE_MESSAGE })).toBeVisible()
			await expect(page.getByTestId('edit-status')).toContainText('Pas enregistré')
			await checkScreen(page, 'erreur')
			await shot(page, 'erreur')
			await page.unroute('**/auth/apercu-profil**', cut)
			await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant')
			const payload = await testPayload()
			const stored = await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })
			expect(stored.serviceOffers?.filter(offer => offer.name === 'Maquillage shooting')).toHaveLength(1)
		})

		test('le nom manquant est dit sous le champ', async ({ context, page }) => {
			await open(page, context, 'reference')
			await pen(page, PEN).click()
			await page.getByRole('button', { name: 'Ajouter une prestation' }).click()
			await page.getByLabel('Prix', { exact: true }).fill('65')
			await page.getByRole('button', { name: 'Enregistrer cette prestation' }).click()
			await expect(page.getByText('Le nom de la prestation est requis.')).toBeVisible()
		})

		test('la page publique ne porte aucun contrôle d’édition', async ({ context, page, request }) => {
			const profile = await open(page, context, 'reference')
			const html = await (await request.get(`/profil/${profile.slug}`)).text()
			expect(html).not.toContain('data-direct-edit')
			expect(html).not.toContain(PEN)
		})
	})
}
