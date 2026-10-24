import { expect, type Page, test } from '@playwright/test'
import { MESSAGES_PHOTO } from '@/lib/dashboard/photo'
import { createAccount, type TestAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { EDIT_PATH } from '../support/direct-edit-e2e'
import { testPayload } from '../support/payload-test'
import { eightMbPhoto } from '../support/photo-8-mb'
import { fileForPayload } from '../support/photos'
import { readObject } from '../support/s3'

/**
 * The main photo on her page (ticket 134 moved to the block « Photo principale », issues 1008 and 1022; plan 02
 * E36, I24, U03): reduced in the browser before it leaves, sent only at « Enregistrer », replaced with the former
 * one in the bin, refused with a message before anything is sent. A photo of 8 MiB is made up for the test
 * (tests/support/photo-8-mb.ts). The refusal of a file that is no photo is in tests/e2e/direct-edit-header.spec.ts.
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

/**
 * A commune of the official list, far from the cities the search specs look at (Annecy, Nantes,
 * Annemasse…): the city a profile needs to be active, without crowding their lists.
 */
const CITY = { name: 'Lille', inseeCode: '59350' } as const

/** The accounts a test made: their active, published profiles would crowd the lists of the search specs. */
const created: number[] = []

test.afterEach(async () => {
	const payload = await testPayload()
	for (const account of created.splice(0)) {
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account } } })
		for (const { id } of docs) await payload.delete({ collection: 'profiles', id }).catch(() => undefined)
		await payload.delete({ collection: 'pros', id: account }).catch(() => undefined)
	}
})

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${100 + (++counter % 50)}` })
)

type Artist = TestAccount<'maquilleuse'>

/** A makeup artist whose profile is published, with or without a photo already (a former one). */
async function artist(
	context: { addCookies: (c: Artist['session']['cookies']) => Promise<void> },
	avecPhoto = false
): Promise<{ compte: Artist; ancienne: number | null; slug: string }> {
	const account = await createAccount('maquilleuse')
	created.push(Number(account.id))
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
	const [sheet] = docs
	if (!sheet) throw new Error('pas de profil')
	let former: number | null = null
	if (avecPhoto) {
		const media = await payload.create({
			collection: 'media',
			data: { owner: Number(account.id), alt: 'Photo principale' },
			file: fileForPayload(),
		})
		former = media.id
	}
	const profile = await payload.update({
		collection: 'profiles',
		id: sheet.id,
		data: {
			firstName: 'Léa',
			lastName: 'Fictive',
			specialty: 'Mariée',
			city: CITY,
			...(former === null ? {} : { mainPicture: former }),
		},
	})
	await context.addCookies(account.session.cookies)
	return { compte: account, ancienne: former, slug: profile.slug ?? '' }
}

async function storedProfile(compte: Artist) {
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } })
	const profile = docs[0]
	if (!profile) throw new Error('pas de profil')
	return profile
}

/** The media of this account only: the two projects share the bench and run side by side. */
const mediaCount = async (compte: Artist) =>
	(await (await testPayload()).count({ collection: 'media', where: { owner: { equals: compte.id } } })).totalDocs
const modify = (page: Page) => page.getByRole('button', { name: 'Modifier ma photo principale' })
const editor = (page: Page) => page.locator('[data-direct-edit-editor]')
const saved = (page: Page) => page.getByTestId('edit-status')
const file = (page: Page) => editor(page).locator('input[type="file"]')

async function open(page: Page) {
	if (test.info().project.name === 'mobile') await modify(page).tap()
	else await modify(page).click()
	await expect(editor(page)).toBeVisible()
}

/** The requests that send a photo to the server. */
function uploads(page: Page): string[] {
	const list: string[] = []
	page.on('request', requete => {
		if (requete.method() === 'POST' && new URL(requete.url()).pathname === '/api/media') list.push(requete.url())
	})
	return list
}

test.describe('134 : la photo principale (1022 : sur la page)', { tag: '@mobile' }, () => {
	test('E36 : une photo de 8 Mo est réduite avant l’envoi, enregistrée, visible après rechargement et sur le profil public', async ({
		context,
		page,
	}) => {
		test.setTimeout(120_000)
		const { compte: account, slug } = await artist(context)
		const original = await eightMbPhoto()
		expect(original.length).toBeGreaterThan(7.5 * 1024 * 1024)
		await page.goto(EDIT_PATH)
		await open(page)

		await file(page).setInputFiles({ name: 'grosse.jpg', mimeType: 'image/jpeg', buffer: original })
		await expect(page.getByRole('img', { name: 'Aperçu de la photo choisie' })).toBeVisible({ timeout: 60_000 })
		expect(await violationsSevere(page)).toEqual([])
		const sent = uploads(page)
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(editor(page)).toHaveCount(0, { timeout: 60_000 })
		await expect(saved(page)).toHaveText('Enregistré à l’instant')
		await expect(modify(page)).toBeFocused()
		expect(sent).toHaveLength(1)

		// The object is the reduced file, under 1 MiB, though the server would have taken 8 MiB.
		const profile = await storedProfile(account)
		expect(profile.active).toBe(true)
		const payload = await testPayload()
		const media = await payload.findByID({ collection: 'media', id: Number(profile.mainPicture), depth: 0 })
		expect(media.filesize ?? 0).toBeGreaterThan(0)
		expect(media.filesize ?? Number.POSITIVE_INFINITY).toBeLessThan(1024 * 1024)
		const object = await readObject(`media/${media.filename}`)
		expect(object?.octets.length ?? Number.POSITIVE_INFINITY).toBeLessThan(1024 * 1024)
		expect(Math.max(media.width ?? 0, media.height ?? 0)).toBeLessThanOrEqual(2000)

		await page.reload()
		await expect(page.locator('[data-direct-edit="photo"] img').first()).toBeVisible()
		await open(page)
		await expect(page.getByRole('img', { name: 'Ta photo principale actuelle' })).toBeVisible()
		await page.keyboard.press('Escape')

		await page.goto(`/profil/${slug}`)
		const photo = page.getByRole('img', { name: /^Photo de / }).first()
		await expect(photo).toBeVisible()
		expect(await photo.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)

		const folder = process.env.DASHBOARD_SCREENSHOTS
		if (folder) await page.screenshot({ path: `${folder}/photo-${test.info().project.name}.png` })
	})

	test('fermer sans valider n’envoie rien : aucun objet, aucun média', async ({ context, page }) => {
		const { compte: account } = await artist(context)
		const sent = uploads(page)
		await page.goto(EDIT_PATH)
		await open(page)

		await file(page).setInputFiles({
			name: 'a.jpg',
			mimeType: 'image/jpeg',
			buffer: await eightMbPhoto(),
		})
		await expect(page.getByRole('img', { name: 'Aperçu de la photo choisie' })).toBeVisible({ timeout: 60_000 })
		await page.getByRole('button', { name: 'Annuler' }).click()
		await page.getByRole('button', { name: 'Abandonner mes modifications' }).click()

		await expect(editor(page)).toHaveCount(0)
		expect(sent).toHaveLength(0)
		expect(await mediaCount(account)).toBe(0)
		expect((await storedProfile(account)).mainPicture ?? null).toBeNull()
	})

	test('I24 : remplacer la photo : l’ancien objet part en corbeille, la nouvelle est celle du profil', async ({
		context,
		page,
	}) => {
		test.setTimeout(120_000)
		const { compte: account, ancienne: former } = await artist(context, true)
		const payload = await testPayload()
		const old = await payload.findByID({ collection: 'media', id: Number(former), depth: 0 })
		const oldKey = `media/${old.filename}`
		const bytesBefore = (await readObject(oldKey))?.octets
		expect(bytesBefore).toBeDefined()
		await page.goto(EDIT_PATH)
		await open(page)

		await file(page).setInputFiles({
			name: 'nouvelle.jpg',
			mimeType: 'image/jpeg',
			buffer: await eightMbPhoto(),
		})
		await expect(page.getByRole('img', { name: 'Aperçu de la photo choisie' })).toBeVisible({ timeout: 60_000 })
		await page.getByRole('button', { name: 'Enregistrer' }).click()
		await expect(editor(page)).toHaveCount(0, { timeout: 60_000 })

		const profile = await storedProfile(account)
		expect(profile.mainPicture).not.toBe(former)
		expect(await readObject(oldKey)).toBeUndefined()
		expect((await readObject(`deleted/${oldKey}`))?.octets).toEqual(bytesBefore)
		expect(
			await payload.findByID({ collection: 'media', id: Number(former), depth: 0, disableErrors: true })
		).toBeNull()
	})

	test('U03 : coupure pendant l’envoi : l’ancienne photo reste en place, le profil reste actif', async ({
		context,
		page,
	}) => {
		test.setTimeout(120_000)
		const { compte: account, ancienne: former } = await artist(context, true)
		await page.goto(EDIT_PATH)
		await open(page)
		await page.route('**/api/media*', route => (route.request().method() === 'POST' ? route.abort() : route.continue()))

		await file(page).setInputFiles({
			name: 'nouvelle.jpg',
			mimeType: 'image/jpeg',
			buffer: await eightMbPhoto(),
		})
		await expect(page.getByRole('img', { name: 'Aperçu de la photo choisie' })).toBeVisible({ timeout: 60_000 })
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(page.getByRole('alert').filter({ hasText: MESSAGES_PHOTO['envoi-impossible'] })).toBeVisible()
		await expect(editor(page)).toBeVisible()
		const profile = await storedProfile(account)
		expect(profile.mainPicture).toBe(former)
		expect(profile.active).toBe(true)
		expect(await mediaCount(account)).toBe(1)
	})
})
