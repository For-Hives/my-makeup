import { expect, type Page, test } from '@playwright/test'
import { MESSAGES_PHOTO } from '@/lib/dashboard/photo'
import { FAILURE_MESSAGE, MESSAGE_SESSION } from '@/lib/dashboard/result'
import { block, checkScreen, EDIT_PATH, editHarness, pen, SIZES, shot as shotOf } from '../support/direct-edit-e2e'
import { testPayload } from '../support/payload-test'
import { largePhotoSynthetic } from '../support/synthetic-photo'

/**
 * The header of her own page in edit mode (issue 1008), at 390 px and at 1440 px: the normal, hover,
 * empty, editing and error states; no horizontal scroll, every control at least 44 px, no « serious »
 * or « critical » axe violation; the keyboard; and a visitor's page that holds no editing control.
 * Set `SCREENSHOT_DIR` to a folder to keep the screenshots. All made-up people, each size with
 * profiles of its own (the two sizes run side by side).
 */

const shot = (page: Page, name: string) => shotOf(page, '1008', name)

for (const size of SIZES) {
	test.describe(`1008 à ${size.width} px`, () => {
		test.use({ viewport: { width: size.width, height: size.height }, hasTouch: size.touch })

		test.describe.configure({ timeout: 120_000 })

		// The tests of a file run in several workers at once: each one makes the profile it needs, under a
		// name of its own, and takes it away at its end (never a profile another worker may be using).
		const { open } = editHarness(size)

		test('l’état normal : quatre blocs, chacun un bouton de 44 px, aucune erreur d’accessibilité', async ({
			context,
			page,
		}) => {
			await open(page, context, 'reference')
			for (const name of [
				'Modifier ma photo principale',
				'Modifier mon nom et ma spécialité',
				'Modifier ma zone',
				'Modifier ma disponibilité',
			])
				await expect(pen(page, name)).toBeVisible()
			// The pen is drawn even without hover: a touch screen has none.
			await expect(block(page, 'photo').locator('[aria-hidden="true"]').first()).toBeVisible()
			await checkScreen(page, 'normal')
			await shot(page, 'normal')
		})

		test('le survol (ou le focus clavier) montre qu’on peut modifier', async ({ context, page }) => {
			await open(page, context, 'reference')
			const photo = block(page, 'photo')
			const label = photo.getByText('Modifier', { exact: true })
			await expect(label).toBeHidden()
			if (size.touch) {
				await pen(page, 'Modifier ma photo principale').focus()
			} else {
				await photo.hover()
			}
			await expect(label).toBeVisible()
			await expect(photo).toHaveCSS('--tw-ring-color', /.+/)
			await shot(page, 'survol')
		})

		test('l’état vide : chaque bloc vide dit quoi faire', async ({ context, page }) => {
			await open(page, context, 'vide')
			const empties = page.locator('[data-direct-edit-empty]')
			await expect(empties.filter({ hasText: 'Ajoute ta photo' })).toBeVisible()
			await expect(empties.filter({ hasText: 'Dis où tu travailles.' })).toBeVisible()
			await checkScreen(page, 'vide')
			await shot(page, 'vide')
		})

		test('l’édition sur place : la spécialité change, la page est relue, la base garde la valeur', async ({
			context,
			page,
		}) => {
			const profile = await open(page, context, 'reference')
			await pen(page, 'Modifier mon nom et ma spécialité').click()
			const editor = page.locator('[data-direct-edit-editor]')
			await expect(editor).toContainText('Nom et spécialité · je modifie')
			await expect(page.locator('#direct-identity-prenom')).toBeFocused()
			await page.locator('#direct-identity-specialite').fill('Maquillage soirée')
			await expect(page.getByTestId('edit-status')).toHaveText('Modification en cours')
			await checkScreen(page, 'édition')
			await shot(page, 'edition')

			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant')
			await expect(editor).toHaveCount(0)
			await expect(page.getByText('Maquillage soirée', { exact: true }).first()).toBeVisible()
			const payload = await testPayload()
			const stored = await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })
			expect(stored.specialty).toBe('Maquillage soirée')
			// The focus goes back to the block she changed.
			await expect(pen(page, 'Modifier mon nom et ma spécialité')).toBeFocused()
		})

		test('l’erreur : un réseau coupé est dit en français, la saisie reste, puis l’enregistrement passe', async ({
			context,
			page,
		}) => {
			const profile = await open(page, context, 'reference')
			await pen(page, 'Modifier mon nom et ma spécialité').click()
			await page.locator('#direct-identity-specialite').fill('Maquillage naturel')
			const cut = (route: {
				request: () => { method: () => string }
				abort: () => Promise<void>
				continue: () => Promise<void>
			}) => (route.request().method() === 'POST' ? route.abort() : route.continue())
			await page.route('**/auth/apercu-profil**', cut)
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByRole('alert').filter({ hasText: FAILURE_MESSAGE })).toBeVisible()
			await expect(page.locator('#direct-identity-specialite')).toHaveValue('Maquillage naturel')
			await expect(page.getByTestId('edit-status')).toContainText('Pas enregistré')
			await checkScreen(page, 'erreur')
			await shot(page, 'erreur')

			await page.unroute('**/auth/apercu-profil**', cut)
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant')
			const payload = await testPayload()
			expect((await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })).specialty).toBe(
				'Maquillage naturel'
			)
		})

		test('la session expirée : rien n’est perdu et un lien rouvre la connexion dans un autre onglet', async ({
			context,
			page,
		}) => {
			await open(page, context, 'reference')
			await pen(page, 'Modifier mon nom et ma spécialité').click()
			await page.locator('#direct-identity-specialite').fill('Maquillage de scène')
			await context.clearCookies()
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			const alert = page.getByRole('alert').filter({ hasText: MESSAGE_SESSION })
			await expect(alert).toBeVisible()
			await expect(alert.getByRole('link', { name: /Te reconnecter/ })).toHaveAttribute('target', '_blank')
			await expect(page.locator('#direct-identity-specialite')).toHaveValue('Maquillage de scène')
			await shot(page, 'session-expiree')
		})

		test('la photo : un fichier refusé est dit avant l’envoi, une photo valide est envoyée à l’enregistrement', async ({
			context,
			page,
		}) => {
			const profile = await open(page, context, 'reference')
			const payload = await testPayload()
			const before = (await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })).mainPicture
			await pen(page, 'Modifier ma photo principale').click()
			const input = page.locator('input[type="file"]')
			let uploads = 0
			page.on('request', request => {
				if (request.method() === 'POST' && request.url().includes('/api/media')) uploads++
			})

			await input.setInputFiles({ name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') })
			await expect(page.getByRole('alert').filter({ hasText: MESSAGES_PHOTO.type })).toBeVisible()
			expect(uploads).toBe(0)
			await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()

			const photo = Buffer.from(await largePhotoSynthetic())
			await input.setInputFiles({ name: 'portrait.webp', mimeType: 'image/webp', buffer: photo })
			await expect(page.getByRole('img', { name: 'Aperçu de la photo choisie' })).toBeVisible({ timeout: 60_000 })
			expect(uploads).toBe(0)
			await shot(page, 'photo')
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant', { timeout: 60_000 })
			expect(uploads).toBe(1)
			const after = (await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })).mainPicture
			expect(after).not.toEqual(before)
		})

		test('au clavier : Entrée ouvre le bloc, Échap le ferme, le focus revient', async ({ context, page }) => {
			await open(page, context, 'reference')
			const status = pen(page, 'Modifier ma disponibilité')
			await status.focus()
			await page.keyboard.press('Enter')
			await expect(page.locator('[data-direct-edit-editor]')).toContainText('Disponibilité · je modifie')
			await expect(page.getByRole('radio').first()).toBeFocused()
			await page.keyboard.press('Escape')
			await expect(page.locator('[data-direct-edit-editor]')).toHaveCount(0)
			await expect(status).toBeFocused()
		})

		test('la page publique ne porte aucun contrôle d’édition, même pour la propriétaire connectée', async ({
			context,
			page,
			request,
		}) => {
			const profile = await open(page, context, 'reference')
			const visitor = await request.get(`/profil/${profile.slug}`)
			expect(visitor.status()).toBe(200)
			expect(await visitor.text()).not.toContain('data-direct-edit')
			// Signed in, the public address still holds no editing control: it ignores her session.
			await page.goto(`/profil/${profile.slug}`)
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
			expect(await page.locator('[data-direct-edit]').count()).toBe(0)
			expect(await page.content()).not.toContain('Modifier ma')
			// Her own page in edit mode is private and not indexed.
			const own = await page.goto(EDIT_PATH)
			expect(own?.headers()['cache-control']).toBe('private, no-store')
			expect(own?.headers()['x-robots-tag']).toContain('noindex')
			expect(await page.locator('[data-direct-edit]').count()).toBeGreaterThan(0)
		})
	})
}
