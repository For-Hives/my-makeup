import { expect, type Page, test } from '@playwright/test'
import { createAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { testPayload } from '../support/payload-test'
import { fileForPayload } from '../support/photos'
import { readObject } from '../support/s3'

/**
 * She deletes her account from her space (ticket 141; plan 02 E33): a dialog that asks for her
 * password, a wrong one that deletes nothing, then the deletion: signed out, her public page is a
 * 404, her photo is in the bin of the storage, and she cannot sign in again. A held Enter sends one
 * request. All made-up people.
 *
 * The brake counts by client address: each test sends its own made-up address.
 */

const PASSWORD = 'motdepasse-fictif-141'
const CITY = { name: 'Lille', inseeCode: '59350' } as const

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${150 + (++counter % 50)}` })
)

/** An account with a profile that names a photo, and the session in the browser. */
async function artist(context: { addCookies: (c: never[]) => Promise<void> }) {
	const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
	const payload = await testPayload()
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
		data: { firstName: 'Léa', lastName: 'Fictive', specialty: 'Mariée', city: CITY, mainPicture: media.id },
	})
	await context.addCookies(account.session.cookies as never[])
	return { compte: account, media, profil: profile, slug: profile.slug ?? '' }
}

const exists = async (collection: 'pros' | 'profiles' | 'media', id: number | string) =>
	(await (await testPayload()).findByID({ collection, id, depth: 0, disableErrors: true, overrideAccess: true })) !==
	null

async function openWindow(page: Page) {
	await page.goto('/auth/account')
	await expect(page.getByTestId('zone-suppression')).toBeVisible()
	await page.getByTestId('zone-suppression').getByRole('button', { name: 'Supprimer mon compte' }).click()
	await expect(page.getByRole('dialog', { name: 'Supprimer mon compte' })).toBeVisible()
}

const field = (page: Page) => page.getByLabel('Retape ton mot de passe pour confirmer')

test.describe('141 : supprimer mon compte', { tag: '@mobile' }, () => {
	test('E33 : un mauvais mot de passe ne supprime rien ; le bon : déconnexion, page publique en 404, reconnexion impossible', async ({
		context,
		page,
	}) => {
		const { compte: account, media, profil: profile, slug } = await artist(context)
		expect((await page.request.get(`/profil/${slug}`)).status()).toBe(200)

		await openWindow(page)
		await expect(page.getByRole('dialog')).toContainText('toutes tes photos seront supprimés pour toujours')
		await page.screenshot({ path: `test-results/essais/suppression-fenetre-${test.info().project.name}.png` })
		expect(await violationsSevere(page)).toEqual([])

		await field(page).fill('pas-le-bon')
		await page.getByRole('button', { name: 'Supprimer définitivement mon compte' }).click()
		await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Ce n’est pas le bon mot de passe')
		await expect(page.getByRole('dialog')).toBeVisible()
		expect(await exists('pros', account.id)).toBe(true)
		expect(await exists('profiles', profile.id)).toBe(true)
		expect((await page.request.get(`/profil/${slug}`)).status()).toBe(200)

		await field(page).fill(PASSWORD)
		await page.getByRole('button', { name: 'Supprimer définitivement mon compte' }).click()

		await expect(page).toHaveURL(/\/$/)
		expect((await context.cookies()).filter(c => c.name === 'payload-token')).toEqual([])
		expect(await exists('pros', account.id)).toBe(false)
		expect(await exists('profiles', profile.id)).toBe(false)
		expect(await exists('media', media.id)).toBe(false)
		expect(await readObject(`media/${media.filename}`)).toBeUndefined()
		expect(await readObject(`deleted/media/${media.filename}`)).toBeDefined()
		expect((await page.request.get(`/profil/${slug}`)).status()).toBe(404)

		await page.goto('/auth/profil')
		await expect(page).toHaveURL(/\/auth\/signin/)
		await page.getByLabel('Adresse email').fill(account.email)
		await page.getByLabel('Mot de passe').fill(PASSWORD)
		await page.getByRole('button', { name: 'Se connecter' }).click()
		await expect(page.getByTestId('erreur-connexion')).toHaveText('Email ou mot de passe incorrect.')
		await expect(page).toHaveURL(/\/auth\/signin(\?|$)/)
	})

	test('Entrée maintenue : une seule suppression', async ({ context, page }) => {
		const { compte: account } = await artist(context)
		const uploads: string[] = []
		page.on('request', requete => {
			if (requete.method() === 'POST' && new URL(requete.url()).pathname === '/auth/account')
				uploads.push(requete.url())
		})
		await openWindow(page)
		await field(page).fill(PASSWORD)

		await field(page).focus()
		await page.keyboard.down('Enter')
		for (let i = 0; i < 5; i++) await page.keyboard.down('Enter')
		await page.keyboard.up('Enter')

		await expect(page).toHaveURL(/\/$/)
		expect(uploads).toHaveLength(1)
		expect(await exists('pros', account.id)).toBe(false)
	})
})
