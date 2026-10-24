import { expect, type Page, test } from '@playwright/test'
import { block, checkScreen, editHarness, pen, SIZES, shot as shotOf } from '../support/direct-edit-e2e'
import { testPayload } from '../support/payload-test'

/**
 * The banner at the top of her page in edit mode (issue 1072), at 390 px and at 1440 px, in each state: draft,
 * incomplete, publishable, hidden, suspended. The list of what is missing leads to the blocks, is updated at a
 * save without a reload, and says nothing for a page the team hid. No horizontal scroll, targets of 44 px, no
 * serious axe violation. Set `SCREENSHOT_DIR` to keep the screenshots.
 */

const shot = (page: Page, name: string) => shotOf(page, '1072', name)
const banner = (page: Page) => page.getByTestId('edit-banner')

for (const size of SIZES) {
	test.describe(`1072 à ${size.width} px`, () => {
		test.use({ viewport: { width: size.width, height: size.height }, hasTouch: size.touch })
		test.describe.configure({ timeout: 120_000 })
		const { open } = editHarness(size)

		test('brouillon : tout ce qui manque est listé, chaque point mène à son bloc', async ({ context, page }) => {
			await open(page, context, 'vide')
			await expect(banner(page)).toHaveAttribute('data-state', 'draft')
			await expect(banner(page)).toContainText('Ton profil n’est pas encore visible.')
			const links = banner(page).getByRole('link')
			await expect(links).toHaveCount(6)
			for (const [criterion, anchor] of [
				['specialite', 'identity'],
				['ville', 'place'],
				['description', 'about'],
				['photo', 'photo'],
				['offres', 'services'],
				['reseaux', 'networks'],
			] as const) {
				const link = page.getByTestId(`missing-${criterion}`)
				await expect(link).toHaveAttribute('href', `/auth/apercu-profil?mode=edition#bloc-${anchor}`)
				expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
			}
			await page.getByTestId('missing-description').click()
			await expect(page).toHaveURL(/#bloc-about$/)
			await expect(block(page, 'about')).toBeInViewport()
			await checkScreen(page, 'brouillon')
			await shot(page, 'brouillon')
		})

		test('incomplet : seulement ce qui manque encore', async ({ context, page }) => {
			await open(page, context, 'actif-non-publiable')
			await expect(banner(page)).toHaveAttribute('data-state', 'incomplete')
			await expect(banner(page).getByRole('link')).toHaveCount(1)
			await expect(page.getByTestId('missing-offres')).toContainText('une prestation avec un prix en chiffres')
			await checkScreen(page, 'incomplet')
			await shot(page, 'incomplet')
		})

		test('l’enregistrement d’un bloc met la liste à jour sans recharger la page', async ({ context, page }) => {
			await open(page, context, 'vide')
			await page.evaluate(() => {
				;(window as unknown as { alive: boolean }).alive = true
			})
			await expect(page.getByTestId('missing-description')).toBeVisible()
			await pen(page, 'Modifier ma présentation').click()
			await page
				.locator('#direct-about-text')
				.fill('Je maquille depuis huit ans, surtout des mariées et des invitées, à domicile. '.repeat(3))
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant')
			await expect(page.getByTestId('missing-description')).toHaveCount(0)
			await expect(banner(page).getByRole('link')).toHaveCount(5)
			// The page was read again, not loaded again.
			expect(await page.evaluate(() => (window as unknown as { alive?: boolean }).alive)).toBe(true)
		})

		test('publiable : « Ton profil est visible » et le lien vers la page publique', async ({ context, page }) => {
			const profile = await open(page, context, 'reference')
			await expect(banner(page)).toHaveAttribute('data-state', 'publishable')
			await expect(banner(page)).toContainText('Ton profil est visible')
			await expect(banner(page).getByRole('link', { name: 'Voir ma page publique' })).toHaveAttribute(
				'href',
				`/profil/${profile.slug}`
			)
			await expect(banner(page)).not.toContainText('Il manque')
			await checkScreen(page, 'publiable')
			await shot(page, 'publiable')
		})

		test('masqué : un message à part, sans liste', async ({ context, page }) => {
			await open(page, context, 'masquee')
			await expect(banner(page)).toHaveAttribute('data-state', 'hidden')
			await expect(banner(page)).toContainText('Ton profil est masqué par l’équipe')
			await expect(banner(page).getByRole('link')).toHaveCount(0)
			await checkScreen(page, 'masqué')
			await shot(page, 'masque')
		})

		test('suspendu : un message à part, sans liste', async ({ context, page }) => {
			const profile = await open(page, context, 'masquee')
			const payload = await testPayload()
			await payload.update({
				collection: 'profiles',
				id: profile.id,
				data: { status: 'hidden', moderationAction: 'suspend' },
				depth: 0,
			})
			await page.reload()
			await expect(banner(page)).toHaveAttribute('data-state', 'suspended')
			await expect(banner(page)).toContainText('Ton profil est suspendu par l’équipe')
			await expect(banner(page).getByRole('link')).toHaveCount(0)
			await checkScreen(page, 'suspendu')
			await shot(page, 'suspendu')
		})
	})
}
