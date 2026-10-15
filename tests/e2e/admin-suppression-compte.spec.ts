import { expect, test } from '@playwright/test'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest } from '../outils/payload-test'
import { fichierPourPayload } from '../outils/photos'
import { lireUnObjet } from '../outils/s3'

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
		const payload = await payloadDeTest()
		const admin = await creerCompte('admin')
		const compte = await creerCompte('maquilleuse')
		const { docs } = await payload.find({ collection: 'profils', depth: 0, where: { pro: { equals: compte.id } } })
		const [fiche] = docs
		if (!fiche) throw new Error('pas de profil')
		const media = await payload.create({
			collection: 'media',
			data: { owner: Number(compte.id), alt: 'Photo principale' },
			file: fichierPourPayload(),
		})
		const profil = await payload.update({
			collection: 'profils',
			id: fiche.id,
			data: {
				prenom: 'Léa',
				nom: 'Fictive',
				specialite: 'Mariée',
				commune: { nom: 'Lille', codeInsee: '59350' },
				photoPrincipale: media.id,
			},
		})
		const existe = async (collection: 'pros' | 'profils' | 'media', id: number | string) =>
			(await payload.findByID({ collection, id, depth: 0, disableErrors: true, overrideAccess: true })) !== null
		const cle = `media/${media.filename}`

		await context.addCookies(admin.session.cookies as never[])
		await page.goto(`/admin/collections/pros/${compte.id}`)
		const ouvrir = async () => {
			// The form hydrates after it shows: a click that comes too early opens nothing, so it is made again.
			await expect(async () => {
				await page.locator('.doc-controls__popup .popup-button').click({ timeout: 2_000 })
				await page.locator('#action-delete').click({ timeout: 2_000 })
				await expect(page.locator('dialog[open], .confirmation-modal').first()).toBeVisible({ timeout: 2_000 })
			}).toPass({ timeout: 20_000 })
		}

		// The confirmation: cancelling deletes nothing.
		await ouvrir()
		await page.getByRole('button', { name: 'Annuler' }).click()
		expect(await existe('pros', compte.id)).toBe(true)
		expect(await existe('profils', profil.id)).toBe(true)

		await ouvrir()
		await page.getByRole('button', { name: 'Confirmer' }).click()
		await page.waitForURL(/\/admin\/collections\/pros(\?.*)?$/, { timeout: 30_000 })

		expect(await existe('pros', compte.id)).toBe(false)
		expect(await existe('profils', profil.id)).toBe(false)
		expect(await existe('media', media.id)).toBe(false)
		expect(await lireUnObjet(cle)).toBeUndefined()
		expect(await lireUnObjet(`deleted/${cle}`)).toBeDefined()
		expect((await request.get(`/profil/${profil.slug}`)).status()).toBe(404)
		expect((await payload.auth({ headers: new Headers(compte.session.enTetes) })).user).toBeNull()
	})

	test('la rédaction ne voit pas les comptes et ne peut pas en supprimer un', async ({ context, page }) => {
		const redaction = await creerCompte('redaction')
		const compte = await creerCompte('maquilleuse')
		await context.addCookies(redaction.session.cookies as never[])

		const reponse = await page.request.delete(`/api/pros/${compte.id}`)
		expect(reponse.status()).toBe(403)
		expect(
			(await (await payloadDeTest()).findByID({ collection: 'pros', id: compte.id, depth: 0, disableErrors: true })) !==
				null
		).toBe(true)
	})
})
