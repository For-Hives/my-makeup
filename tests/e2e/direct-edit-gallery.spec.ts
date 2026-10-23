import { expect, test } from '@playwright/test'
import { MESSAGES_PHOTO } from '@/lib/dashboard/photo'
import { UNCERTAIN_RESULT_MESSAGE } from '@/lib/dashboard/photos-upload'
import { block, checkScreen, editHarness, pen, SIZES, shot as shotOf } from '../support/direct-edit-e2e'
import { testPayload } from '../support/payload-test'
import { largePhotoSynthetic } from '../support/synthetic-photo'

/**
 * Portfolio of her own page in edit mode (issue 1018), at 390 px and at 1440 px: the normal, hover, empty,
 * editing and error states; the order changed and saved (mouse, touch and keyboard all press the
 * buttons); the main photo chosen in the gallery; the alternative text; the uploads and their refusals;
 * no horizontal scroll, targets of 44 px, no serious axe violation; a visitor's page without controls.
 */

const shot = (page: Parameters<typeof shotOf>[0], name: string) => shotOf(page, '1018', name)
const PEN = 'Modifier mon portfolio'

async function galleryOf(profileId: number | string) {
	const payload = await testPayload()
	const stored = await payload.findByID({ collection: 'profiles', id: profileId, depth: 0 })
	return (stored.gallery ?? []).map(photo => (typeof photo === 'object' ? photo.id : photo))
}

for (const size of SIZES) {
	test.describe(`1018 à ${size.width} px`, () => {
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
			const gallery = block(page, 'gallery')
			await gallery.scrollIntoViewIfNeeded()
			const label = gallery.getByText('Modifier', { exact: true })
			await expect(label).toBeHidden()
			if (size.touch) await pen(page, PEN).focus()
			else await gallery.hover()
			await expect(label).toBeVisible()
			await shot(page, 'survol')
		})

		test('l’état vide : le bloc reste sur la page et dit quoi faire', async ({ context, page }) => {
			await open(page, context, 'vide')
			await expect(
				page.locator('[data-direct-edit-empty]').filter({ hasText: 'Ajoute des photos de tes réalisations.' })
			).toBeVisible()
			await checkScreen(page, 'vide')
			await shot(page, 'vide')
		})

		test('l’ordre : la première photo recule, l’ordre est enregistré, au clavier comme au toucher', async ({
			context,
			page,
		}) => {
			const profile = await open(page, context, 'reference')
			const before = await galleryOf(profile.id)
			expect(before.length).toBeGreaterThan(1)
			await pen(page, PEN).click()
			await expect(page.getByText('Ajouter des photos', { exact: true })).toBeVisible()
			const later = page.getByRole('button', { name: 'Reculer la photo 1' })
			await later.focus()
			await page.keyboard.press('Enter')
			await expect(page.getByTestId('gallery-announcement')).toHaveText(
				`Photo déplacée en position 2 sur ${before.length}.`
			)
			await expect(page.getByRole('button', { name: 'Reculer la photo 2' })).toBeFocused()
			await checkScreen(page, 'édition')
			await shot(page, 'edition')
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant', { timeout: 60_000 })
			const after = await galleryOf(profile.id)
			expect(after.slice(0, 2)).toEqual([before[1], before[0]])
			expect(new Set(after).size).toBe(after.length)
		})

		test('la photo principale se choisit dans la galerie', async ({ context, page }) => {
			const profile = await open(page, context, 'reference')
			const gallery = await galleryOf(profile.id)
			await pen(page, PEN).click()
			await page.getByRole('button', { name: 'Choisir la photo 2 comme photo principale' }).click()
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant', { timeout: 60_000 })
			const payload = await testPayload()
			const stored = await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })
			const main = Array.isArray(stored.mainPicture) ? stored.mainPicture[0] : stored.mainPicture
			expect(typeof main === 'object' ? main?.id : main).toBe(gallery[1])
		})

		test('le texte alternatif d’une photo est enregistré, sans jamais bloquer', async ({ context, page }) => {
			const profile = await open(page, context, 'reference')
			const gallery = await galleryOf(profile.id)
			await pen(page, PEN).click()
			await expect(page.getByText('Facultatif.').first()).toBeVisible()
			await page.getByLabel('Description de la photo 1').fill('Mariée de profil, teint lumineux')
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant', { timeout: 60_000 })
			const payload = await testPayload()
			const media = await payload.findByID({ collection: 'media', id: gallery[0] as number, depth: 0 })
			expect(media.alt).toBe('Mariée de profil, teint lumineux')
		})

		test('un fichier refusé est dit avant l’envoi ; une photo valide part à l’enregistrement, une seule fois', async ({
			context,
			page,
		}) => {
			const profile = await open(page, context, 'reference')
			const before = await galleryOf(profile.id)
			await pen(page, PEN).click()
			let uploads = 0
			page.on('request', request => {
				if (request.method() === 'POST' && request.url().includes('/api/media')) uploads++
			})
			const input = page.locator('input[type="file"]')
			await input.setInputFiles({ name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') })
			await expect(page.getByRole('alert').filter({ hasText: MESSAGES_PHOTO.type })).toBeVisible()
			expect(uploads).toBe(0)
			const photo = Buffer.from(await largePhotoSynthetic())
			await input.setInputFiles({ name: 'portrait.webp', mimeType: 'image/webp', buffer: photo })
			await expect(page.getByText('À enregistrer')).toBeVisible({ timeout: 60_000 })
			expect(uploads).toBe(0)
			await shot(page, 'ajout')
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant', { timeout: 60_000 })
			expect(uploads).toBe(1)
			expect(await galleryOf(profile.id)).toHaveLength(before.length + 1)
		})

		test('l’erreur : une réponse perdue est dite en français, l’ordre reste, puis l’enregistrement passe', async ({
			context,
			page,
		}) => {
			const profile = await open(page, context, 'reference')
			const before = await galleryOf(profile.id)
			await pen(page, PEN).click()
			await page.getByRole('button', { name: 'Reculer la photo 1' }).click()
			const cut = (route: {
				request: () => { method: () => string }
				abort: () => Promise<void>
				continue: () => Promise<void>
			}) => (route.request().method() === 'POST' ? route.abort() : route.continue())
			await page.route('**/auth/apercu-profil**', cut)
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByRole('alert').filter({ hasText: UNCERTAIN_RESULT_MESSAGE })).toBeVisible()
			await expect(page.getByRole('button', { name: 'Avancer la photo 2' })).toBeVisible()
			await checkScreen(page, 'erreur')
			await shot(page, 'erreur')
			await page.unroute('**/auth/apercu-profil**', cut)
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant', { timeout: 60_000 })
			expect((await galleryOf(profile.id)).slice(0, 2)).toEqual([before[1], before[0]])
		})

		test('la page publique ne porte aucun contrôle d’édition', async ({ context, page, request }) => {
			const profile = await open(page, context, 'reference')
			const html = await (await request.get(`/profil/${profile.slug}`)).text()
			expect(html).not.toContain('data-direct-edit')
			expect(html).not.toContain(PEN)
		})
	})
}
