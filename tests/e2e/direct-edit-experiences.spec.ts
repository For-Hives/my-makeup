import { expect, test } from '@playwright/test'
import { block, checkScreen, editHarness, pen, SIZES, shot as shotOf } from '../support/direct-edit-e2e'
import { testPayload } from '../support/payload-test'

/**
 * Les expériences de sa page en édition (issue 1075), à 390 et 1440 px : la dernière liste de l'ancien espace qui
 * n'avait pas son bloc. Une ligne ajoutée est enregistrée avec la liste, une fin avant le début est refusée sous le
 * champ ; pas de défilement horizontal, cibles de 44 px, axe sans violation grave ; la page publique n'a aucun contrôle.
 */

const shot = (page: Parameters<typeof shotOf>[0], name: string) => shotOf(page, '1075', name)

for (const size of SIZES) {
	test.describe(`1075 à ${size.width} px`, () => {
		test.use({ viewport: { width: size.width, height: size.height }, hasTouch: size.touch })
		test.describe.configure({ timeout: 120_000 })
		const { open } = editHarness(size)

		test('l’état vide : le bloc reste sur la page et dit quoi faire', async ({ context, page }) => {
			await open(page, context, 'vide')
			await expect(
				page.locator('[data-direct-edit-empty]').filter({ hasText: 'Ajoute tes expériences.' })
			).toBeVisible()
			await expect(pen(page, 'Modifier mes expériences')).toBeVisible()
			await checkScreen(page, 'vide')
			await shot(page, 'vide')
		})

		test('une ligne ajoutée est enregistrée ; une fin avant le début est refusée sous le champ', async ({
			context,
			page,
		}) => {
			const profile = await open(page, context, 'reference')
			await pen(page, 'Modifier mes expériences').click()
			await expect(page.locator('[data-direct-edit-editor]')).toContainText(
				'Tu modifies : Expériences professionnelles'
			)
			await page.getByRole('button', { name: 'Ajouter une expérience' }).click()
			await page.getByLabel('Poste', { exact: true }).fill('Maquilleuse cinéma')
			await page.getByLabel('Entreprise', { exact: true }).fill('Production Fictive')
			await page.getByLabel('Début', { exact: true }).fill('2022-01-10')
			await page.getByLabel('Fin', { exact: true }).fill('2021-01-10')
			await page.getByRole('button', { name: 'Enregistrer cette expérience' }).click()
			await expect(page.getByText('La fin d’une expérience ne peut pas précéder son début.')).toBeVisible()
			await page.getByLabel('Fin', { exact: true }).fill('')
			await checkScreen(page, 'édition')
			await shot(page, 'edition')
			await page.getByRole('button', { name: 'Enregistrer cette expérience' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant')
			const payload = await testPayload()
			const stored = await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })
			expect(stored.experiences?.map(experience => experience.company)).toContain('Production Fictive')
			// On a phone the card is folded: the text is there, whatever its state.
			await expect(block(page, 'experiences')).toContainText('Production Fictive')
		})

		test('la page publique ne porte aucun contrôle d’édition', async ({ context, page, request }) => {
			const profile = await open(page, context, 'reference')
			const visitor = await request.get(`/profil/${profile.slug}`)
			expect(visitor.status()).toBe(200)
			expect(await visitor.text()).not.toContain('Modifier mes expériences')
		})
	})
}
