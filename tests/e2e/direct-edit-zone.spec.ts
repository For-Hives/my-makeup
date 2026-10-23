import { expect, test } from '@playwright/test'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { block, checkScreen, editHarness, pen, SIZES, shot as shotOf } from '../support/direct-edit-e2e'
import { testPayload } from '../support/payload-test'

/**
 * Zone and travels of her own page in edit mode (issue 1019), at 390 px and at 1440 px: the normal,
 * hover, empty, editing and error states; the radius and « à domicile » set in place and stored with the
 * commune she already had (the distance search reads that commune and that radius); no horizontal
 * scroll, targets of 44 px, no serious axe violation; a visitor's page without controls. The commune
 * chosen from the list and the countries are covered by the tests of `saveMyLocation`.
 */

const shot = (page: Parameters<typeof shotOf>[0], name: string) => shotOf(page, '1019', name)
const PEN = 'Modifier mes déplacements'

for (const size of SIZES) {
	test.describe(`1019 à ${size.width} px`, () => {
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
			const travel = block(page, 'travel')
			await travel.scrollIntoViewIfNeeded()
			const label = travel.getByText('Modifier', { exact: true })
			await expect(label).toBeHidden()
			if (size.touch) await pen(page, PEN).focus()
			else await travel.hover()
			await expect(label).toBeVisible()
			await shot(page, 'survol')
		})

		test('l’état vide : le bloc reste sur la page et dit quoi faire', async ({ context, page }) => {
			await open(page, context, 'vide')
			await expect(page.locator('[data-direct-edit-empty]').filter({ hasText: 'Dis si tu te déplaces.' })).toBeVisible()
			await checkScreen(page, 'vide')
			await shot(page, 'vide')
		})

		test('le rayon se règle sur place : la commune reste, le rayon est enregistré', async ({ context, page }) => {
			const profile = await open(page, context, 'reference')
			const payload = await testPayload()
			const before = await payload.findByID({ collection: 'profiles', id: profile.id, depth: 1 })
			await pen(page, PEN).click()
			const editor = page.locator('[data-direct-edit-editor]')
			await expect(editor).toContainText('Mes déplacements · je modifie')
			await page.getByLabel(/Rayon d’action/).fill('42')
			await checkScreen(page, 'édition')
			await shot(page, 'edition')
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant')
			const after = await payload.findByID({ collection: 'profiles', id: profile.id, depth: 1 })
			expect(after.radiusKm).toBe(42)
			const cityOf = (doc: typeof before) => (typeof doc.city === 'object' ? doc.city?.inseeCode : doc.city)
			expect(cityOf(after)).toBe(cityOf(before))
			await expect(page.getByText('jusqu’à 42 km', { exact: false })).toBeVisible()
		})

		test('l’erreur : un réseau coupé est dit en français, la saisie reste, puis l’enregistrement passe', async ({
			context,
			page,
		}) => {
			const profile = await open(page, context, 'reference')
			await pen(page, PEN).click()
			await page.getByLabel(/Rayon d’action/).fill('37')
			const cut = (route: {
				request: () => { method: () => string }
				abort: () => Promise<void>
				continue: () => Promise<void>
			}) => (route.request().method() === 'POST' ? route.abort() : route.continue())
			await page.route('**/auth/apercu-profil**', cut)
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByRole('alert').filter({ hasText: FAILURE_MESSAGE })).toBeVisible()
			await expect(page.getByLabel(/Rayon d’action/)).toHaveValue('37')
			await checkScreen(page, 'erreur')
			await shot(page, 'erreur')
			await page.unroute('**/auth/apercu-profil**', cut)
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant')
			const payload = await testPayload()
			expect((await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })).radiusKm).toBe(37)
		})

		test('la page publique ne porte aucun contrôle d’édition', async ({ context, page, request }) => {
			const profile = await open(page, context, 'reference')
			const html = await (await request.get(`/profil/${profile.slug}`)).text()
			expect(html).not.toContain('data-direct-edit')
			expect(html).not.toContain(PEN)
		})
	})
}
