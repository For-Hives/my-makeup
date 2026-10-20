import { expect, test } from '@playwright/test'
import { createAccount } from '../support/account-factory'
import { testPayload } from '../support/payload-test'
import { fileForPayload } from '../support/photos'
import { readObject } from '../support/s3'

/**
 * E57 (plan 02 §7.4; ticket 167): the admin deletes the account of a makeup artist from its sheet in
 * the panel. The panel asks for a confirmation first (cancelling deletes nothing); once confirmed,
 * the account, the profile and the photo are gone from the database, the photo's object is in the
 * bin of the bucket, the public page answers 404 and her session opens nothing. The newsroom does
 * not even see the collection. Large screen only: the panel is not the mobile surface. All made up.
 */

test.describe('L’admin supprime un compte et tout part avec lui', () => {
	test('E57 : confirmation demandée, puis compte, profil, photo (corbeille) et page publique partis', async ({
		context,
		page,
		request,
	}) => {
		test.setTimeout(120_000)
		const payload = await testPayload()
		const admin = await createAccount('admin')
		const account = await createAccount('maquilleuse')
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
		const [sheet] = docs
		if (!sheet) throw new Error('pas de profil')
		const media = await payload.create({
			collection: 'media',
			data: { owner: Number(account.id), alt: 'Photo principale' },
			file: fileForPayload(),
		})
		const profile = await payload.update({
			collection: 'profiles',
			id: sheet.id,
			data: {
				firstName: 'Léa',
				lastName: 'Fictive',
				specialty: 'Mariée',
				city: { name: 'Lille', inseeCode: '59350' },
				mainPicture: media.id,
			},
		})
		const exists = async (collection: 'pros' | 'profiles' | 'media', id: number | string) =>
			(await payload.findByID({ collection, id, depth: 0, disableErrors: true, overrideAccess: true })) !== null
		const key = `media/${media.filename}`

		await context.addCookies(admin.session.cookies as never[])
		await page.goto(`/admin/collections/pros/${account.id}`)
		const open = async () => {
			// The form hydrates after it shows: a click that comes too early opens nothing, so it is made again.
			await expect(async () => {
				await page.locator('.doc-controls__popup .popup-button').click({ timeout: 2_000 })
				await page.locator('#action-delete').click({ timeout: 2_000 })
				await expect(page.locator('dialog[open], .confirmation-modal').first()).toBeVisible({ timeout: 2_000 })
			}).toPass({ timeout: 20_000 })
		}

		// The confirmation: cancelling deletes nothing.
		await open()
		await page.getByRole('button', { name: 'Annuler' }).click()
		expect(await exists('pros', account.id)).toBe(true)
		expect(await exists('profiles', profile.id)).toBe(true)

		await open()
		await page.getByRole('button', { name: 'Confirmer' }).click()
		await page.waitForURL(/\/admin\/collections\/pros(\?.*)?$/, { timeout: 30_000 })

		expect(await exists('pros', account.id)).toBe(false)
		expect(await exists('profiles', profile.id)).toBe(false)
		expect(await exists('media', media.id)).toBe(false)
		expect(await readObject(key)).toBeUndefined()
		expect(await readObject(`deleted/${key}`)).toBeDefined()
		expect((await request.get(`/profil/${profile.slug}`)).status()).toBe(404)
		expect((await payload.auth({ headers: new Headers(account.session.enTetes) })).user).toBeNull()
	})

	test('la rédaction ne voit pas les comptes et ne peut pas en supprimer un', async ({ context, page }) => {
		const editor = await createAccount('redaction')
		const account = await createAccount('maquilleuse')
		await context.addCookies(editor.session.cookies as never[])

		const response = await page.request.delete(`/api/pros/${account.id}`)
		expect(response.status()).toBe(403)
		expect(
			(await (await testPayload()).findByID({ collection: 'pros', id: account.id, depth: 0, disableErrors: true })) !==
				null
		).toBe(true)
	})
})
