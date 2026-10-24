import { expect, test } from '@playwright/test'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { block, checkScreen, editHarness, pen, SIZES, shot as shotOf } from '../support/direct-edit-e2e'
import { testPayload } from '../support/payload-test'

/**
 * Réseaux et liens of her own page in edit mode (issue 1021), at 390 px and at 1440 px: the normal, hover,
 * empty, editing and error states; « @pseudo » read and stored as an address, a wrong address refused
 * under its field, the outgoing links of the public page with their safety attributes and Instagram
 * first; no horizontal scroll, targets of 44 px, no serious axe violation.
 */

const shot = (page: Parameters<typeof shotOf>[0], name: string) => shotOf(page, '1021', name)
const PEN = 'Modifier mes réseaux'

for (const size of SIZES) {
	test.describe(`1021 à ${size.width} px`, () => {
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
			const networks = block(page, 'networks')
			await networks.scrollIntoViewIfNeeded()
			const label = networks.getByText('Modifier', { exact: true })
			await expect(label).toBeHidden()
			if (size.touch) await pen(page, PEN).focus()
			else await networks.hover()
			await expect(label).toBeVisible()
			await shot(page, 'survol')
		})

		test('l’état vide : le bloc reste sur la page et dit quoi faire', async ({ context, page }) => {
			await open(page, context, 'vide')
			await expect(
				page.locator('[data-direct-edit-empty]').filter({ hasText: 'Ajoute ton Instagram ou ton site.' })
			).toBeVisible()
			await checkScreen(page, 'vide')
			await shot(page, 'vide')
		})

		test('« @pseudo » est lu comme la page le lira, stocké comme une adresse, et la page publique le montre', async ({
			context,
			page,
			request,
		}) => {
			const profile = await open(page, context, 'reference')
			await pen(page, PEN).click()
			await expect(page.locator('#direct-networks-instagram')).toBeFocused()
			await page.locator('#direct-networks-instagram').fill('@nouveau.pseudo')
			await expect(page.getByText('Sur ta page : @nouveau.pseudo')).toBeVisible()
			await page.locator('#direct-networks-facebook').fill('https://www.instagram.com/autre')
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByText('Cette adresse n’est pas celle de Facebook')).toBeVisible()
			await checkScreen(page, 'édition')
			await shot(page, 'edition')
			await page.locator('#direct-networks-facebook').fill('')
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant')
			const payload = await testPayload()
			const stored = await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })
			expect(stored.networks?.instagram).toBe('https://www.instagram.com/nouveau.pseudo')
			const html = await (await request.get(`/profil/${profile.slug}`)).text()
			expect(html).toContain('@nouveau.pseudo')
			expect(html).toMatch(
				/href="https:\/\/www\.instagram\.com\/nouveau\.pseudo"[^>]*rel="noopener nofollow noreferrer"|rel="noopener nofollow noreferrer"[^>]*href="https:\/\/www\.instagram\.com\/nouveau\.pseudo"/
			)
			// Instagram comes before the website.
			expect(html.indexOf('Instagram')).toBeGreaterThan(-1)
			expect(html.indexOf('>Instagram<')).toBeLessThan(html.indexOf('>Site internet<'))
		})

		test('l’erreur : un réseau coupé est dit en français, la saisie reste, puis l’enregistrement passe', async ({
			context,
			page,
		}) => {
			const profile = await open(page, context, 'reference')
			await pen(page, PEN).click()
			// The profile of the set holds an Instagram address of the fake domain: the rule of the server wants the network's own.
			await page.locator('#direct-networks-instagram').fill('@ines.fictive')
			await page.locator('#direct-networks-linkedin').fill('https://www.linkedin.com/in/ines-fictive')
			const cut = (route: {
				request: () => { method: () => string }
				abort: () => Promise<void>
				continue: () => Promise<void>
			}) => (route.request().method() === 'POST' ? route.abort() : route.continue())
			await page.route('**/auth/profil**', cut)
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByRole('alert').filter({ hasText: FAILURE_MESSAGE })).toBeVisible()
			await expect(page.locator('#direct-networks-linkedin')).toHaveValue('https://www.linkedin.com/in/ines-fictive')
			await checkScreen(page, 'erreur')
			await shot(page, 'erreur')
			await page.unroute('**/auth/profil**', cut)
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant')
			const payload = await testPayload()
			expect((await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })).networks?.linkedin).toBe(
				'https://www.linkedin.com/in/ines-fictive'
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
