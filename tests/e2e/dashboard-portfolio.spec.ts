import { expect, type Page, test } from '@playwright/test'
import sharp from 'sharp'
import { MESSAGES_PHOTO } from '@/lib/dashboard/photo'
import { namedPhotos } from '@/lib/profile/photos'
import { createAccount, type TestAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { testPayload } from '../support/payload-test'
import { fileForPayload } from '../support/photos'
import { readObject } from '../support/s3'

/**
 * The portfolio in her space (tickets 135 and 136; plan 02 E34, E35, E36, U80): several photos
 * chosen at once, sent at « Enregistrer » only, ten at most, in the order they were added, on her
 * space and on her public profile; a file that is refused is set aside without losing the others.
 * Made-up people and photos.
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
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${150 + (++counter % 50)}` })
)

type Artist = TestAccount<'maquilleuse'>

/** A makeup artist whose profile is published, with `deja` photos already in her portfolio. */
async function artist(
	context: { addCookies: (c: Artist['session']['cookies']) => Promise<void> },
	deja = 0
): Promise<{ compte: Artist; slug: string }> {
	const account = await createAccount('maquilleuse')
	created.push(Number(account.id))
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
	const [sheet] = docs
	if (!sheet) throw new Error('pas de profil')
	const gallery: number[] = []
	for (let i = 0; i < deja; i++) {
		const media = await payload.create({
			collection: 'media',
			data: { owner: Number(account.id), alt: 'Photo du portfolio' },
			file: fileForPayload(),
		})
		gallery.push(media.id)
	}
	const profile = await payload.update({
		collection: 'profiles',
		id: sheet.id,
		data: { firstName: 'Léa', lastName: 'Fictive', specialty: 'Mariée', city: CITY, gallery: gallery },
	})
	await context.addCookies(account.session.cookies)
	return { compte: account, slug: profile.slug ?? '' }
}

async function storedProfile(compte: Artist) {
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } })
	const profile = docs[0]
	if (!profile) throw new Error('pas de profil')
	return profile
}

/** The media of this account only: the two projects share the bench and run side by side. */
async function mediaOf(compte: Artist) {
	const payload = await testPayload()
	return (
		await payload.find({ collection: 'media', depth: 0, pagination: false, where: { owner: { equals: compte.id } } })
	).docs
}

/** The media of this account that nothing references: the orphans of the test. */
async function orphansOf(compte: Artist): Promise<number[]> {
	const profile = await storedProfile(compte)
	const used = new Set([...namedPhotos(profile.gallery), ...namedPhotos(profile.mainPicture)].map(String))
	return (await mediaOf(compte)).filter(media => !used.has(String(media.id))).map(media => media.id)
}

/** A real PNG of this width: the width tells the photos apart once stored. */
const png = (largeur: number) =>
	sharp({ create: { width: largeur, height: 600, channels: 3, background: { r: largeur % 255, g: 120, b: 150 } } })
		.png()
		.toBuffer()

const filePng = async (largeur: number) => ({
	name: `photo-${largeur}.png`,
	mimeType: 'image/png',
	buffer: await png(largeur),
})

const modify = (page: Page) => page.getByRole('button', { name: 'Modifier mon portfolio' })
const dialogue = (page: Page) => page.getByRole('dialog', { name: 'Modifier mon portfolio' })

async function open(page: Page) {
	if (test.info().project.name === 'mobile') await modify(page).tap()
	else await modify(page).click()
	await expect(dialogue(page)).toBeVisible()
}

/** The requests that send a photo to the server. */
function uploads(page: Page): string[] {
	const list: string[] = []
	page.on('request', requete => {
		if (requete.method() === 'POST' && new URL(requete.url()).pathname === '/api/media') list.push(requete.url())
	})
	return list
}

const lines = (page: Page) =>
	dialogue(page)
		.locator('li')
		.filter({ has: page.locator('img') })

test.describe('135 : le portfolio, ajouter des photos', { tag: '@mobile' }, () => {
	test('E34 : trois photos choisies d’un coup, enregistrées dans l’ordre, visibles dans l’espace et en public', async ({
		context,
		page,
	}) => {
		test.setTimeout(120_000)
		const { compte: account, slug } = await artist(context)
		await page.goto('/auth/profil')
		await expect(page.getByTestId('carte-portfolio')).toContainText('à compléter')
		await open(page)
		const sent = uploads(page)

		await page
			.getByLabel('Ajouter des photos')
			.setInputFiles([await filePng(801), await filePng(802), await filePng(803)])
		await expect(lines(page)).toHaveCount(3, { timeout: 30_000 })
		await expect(dialogue(page).getByText('À enregistrer')).toHaveCount(3)
		expect(sent).toHaveLength(0)
		expect(await violationsSevere(page)).toEqual([])
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(dialogue(page)).toHaveCount(0, { timeout: 60_000 })
		await expect(page.getByRole('status').filter({ hasText: 'Ton portfolio est enregistré.' })).toBeVisible()
		await expect(modify(page)).toBeFocused()
		await expect(page.getByTestId('carte-portfolio')).toContainText('3 photos')
		expect(sent).toHaveLength(3)

		// Stored in the order they were added, with their default alternative text.
		const profile = await storedProfile(account)
		const payload = await testPayload()
		const stored = await Promise.all(
			namedPhotos(profile.gallery).map(id => payload.findByID({ collection: 'media', id: Number(id), depth: 0 }))
		)
		expect(stored.map(media => media.width)).toEqual([801, 802, 803])
		expect(stored.map(media => media.alt)).toEqual(['Photo du portfolio', 'Photo du portfolio', 'Photo du portfolio'])
		expect(await orphansOf(account)).toEqual([])

		await page.reload()
		await open(page)
		await expect(lines(page)).toHaveCount(3)
		await expect(dialogue(page).getByText('À enregistrer')).toHaveCount(0)
		await page.keyboard.press('Escape')

		await page.goto(`/profil/${slug}`)
		for (const rank of [1, 2, 3]) {
			const image = page.getByRole('img', { name: `Réalisation de Léa Fictive (${rank}/3)` })
			await expect(image).toBeAttached()
		}

		const folder = process.env.DASHBOARD_SCREENSHOTS
		if (folder) {
			await page.goto('/auth/profil')
			await open(page)
			await page.screenshot({ path: `${folder}/portfolio-${test.info().project.name}.png` })
		}
	})

	test('U80 : la 11e photo est refusée, les autres sont gardées ; E36 : un PDF est écarté sans perdre les autres', async ({
		context,
		page,
	}) => {
		test.setTimeout(120_000)
		const { compte: account } = await artist(context, 8)
		await page.goto('/auth/profil')
		await open(page)
		const sent = uploads(page)

		await page
			.getByLabel('Ajouter des photos')
			.setInputFiles([
				await filePng(811),
				{ name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n') },
				await filePng(812),
				await filePng(813),
			])

		await expect(lines(page)).toHaveCount(10, { timeout: 30_000 })
		const alerts = page.getByRole('alert')
		await expect(alerts.filter({ hasText: `cv.pdf : ${MESSAGES_PHOTO.type}` })).toBeVisible()
		await expect(alerts.filter({ hasText: `photo-813.png : ${MESSAGES_PHOTO['limite-galerie']}` })).toBeVisible()
		expect(sent).toHaveLength(0)

		await page.getByRole('button', { name: 'Enregistrer' }).click()
		await expect(dialogue(page)).toHaveCount(0, { timeout: 60_000 })
		expect(sent).toHaveLength(2)
		expect(namedPhotos((await storedProfile(account)).gallery)).toHaveLength(10)
		expect(await orphansOf(account)).toEqual([])
	})

	test('E34 : fermer sans valider n’envoie rien : aucun objet, aucun média de plus, 0 orphelin', async ({
		context,
		page,
	}) => {
		const { compte: account } = await artist(context, 1)
		const before = (await mediaOf(account)).length
		const sent = uploads(page)
		await page.goto('/auth/profil')
		await open(page)

		await page.getByLabel('Ajouter des photos').setInputFiles([await filePng(821), await filePng(822)])
		await expect(lines(page)).toHaveCount(3, { timeout: 30_000 })
		await page.getByRole('button', { name: 'Fermer' }).click()
		await page.getByRole('button', { name: 'Abandonner mes modifications' }).click()

		await expect(dialogue(page)).toHaveCount(0)
		expect(sent).toHaveLength(0)
		expect((await mediaOf(account)).length).toBe(before)
		expect(namedPhotos((await storedProfile(account)).gallery)).toHaveLength(1)
		expect(await orphansOf(account)).toEqual([])
		await open(page)
		await expect(lines(page)).toHaveCount(1)
	})

	test('coupure pendant l’envoi : le portfolio reste comme il était, aucun orphelin', async ({ context, page }) => {
		const { compte: account } = await artist(context, 1)
		await page.goto('/auth/profil')
		await open(page)
		// The second file never gets there.
		let n = 0
		await page.route('**/api/media*', route => {
			if (route.request().method() !== 'POST') return route.continue()
			return ++n === 2 ? route.abort() : route.continue()
		})

		await page.getByLabel('Ajouter des photos').setInputFiles([await filePng(831), await filePng(832)])
		await expect(lines(page)).toHaveCount(3, { timeout: 30_000 })
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(page.getByRole('alert').filter({ hasText: MESSAGES_PHOTO['envoi-impossible'] })).toBeVisible()
		await expect(dialogue(page)).toBeVisible()
		await expect.poll(async () => (await mediaOf(account)).length).toBe(1)
		expect(namedPhotos((await storedProfile(account)).gallery)).toHaveLength(1)
		expect(await orphansOf(account)).toEqual([])
	})
})

test.describe('136 : le portfolio, retirer une photo', { tag: '@mobile' }, () => {
	test('E35 : la photo retirée disparaît de l’espace et du profil public, son objet est en corbeille, 0 orphelin', async ({
		context,
		page,
	}) => {
		test.setTimeout(120_000)
		const { compte: account, slug } = await artist(context, 3)
		const payload = await testPayload()
		const before = namedPhotos((await storedProfile(account)).gallery)
		const removed = await payload.findByID({ collection: 'media', id: Number(before[1]), depth: 0 })
		const bytes = (await readObject(`media/${removed.filename}`))?.octets
		expect(bytes).toBeDefined()
		await page.goto('/auth/profil')
		await expect(page.getByTestId('carte-portfolio')).toContainText('3 photos')
		await open(page)

		await page.getByRole('button', { name: 'Retirer la photo 2' }).click()
		await expect(lines(page)).toHaveCount(2)
		await expect(dialogue(page).getByTestId('annonce-retrait')).toContainText(
			'Photo 2 sur 3 de ton portfolio est retirée'
		)
		// The focus stays in the panel, on the photo that takes the place of the one removed.
		await expect(dialogue(page).getByRole('button', { name: 'Retirer la photo 2' })).toBeFocused()
		expect(namedPhotos((await storedProfile(account)).gallery)).toHaveLength(3)
		expect(await violationsSevere(page)).toEqual([])
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(dialogue(page)).toHaveCount(0, { timeout: 60_000 })
		await expect(page.getByTestId('carte-portfolio')).toContainText('2 photos')
		expect(namedPhotos((await storedProfile(account)).gallery)).toEqual([before[0], before[2]])
		expect(await readObject(`media/${removed.filename}`)).toBeUndefined()
		expect((await readObject(`deleted/media/${removed.filename}`))?.octets).toEqual(bytes)
		expect(await orphansOf(account)).toEqual([])

		await page.goto(`/profil/${slug}`)
		await expect(page.getByRole('img', { name: /^Réalisation de Léa Fictive \(\d\/2\)$/ })).toHaveCount(2, {
			timeout: 30_000,
		})
		await expect(page.getByRole('img', { name: /\(\d\/3\)$/ })).toHaveCount(0)
	})

	test('retirer puis fermer sans valider : la photo est toujours là, rien n’a changé', async ({ context, page }) => {
		const { compte: account } = await artist(context, 2)
		const before = namedPhotos((await storedProfile(account)).gallery)
		await page.goto('/auth/profil')
		await open(page)

		await page.getByRole('button', { name: 'Retirer la photo 1' }).click()
		await expect(lines(page)).toHaveCount(1)
		await page.getByRole('button', { name: 'Fermer' }).click()
		await page.getByRole('button', { name: 'Abandonner mes modifications' }).click()
		await expect(dialogue(page)).toHaveCount(0)

		expect(namedPhotos((await storedProfile(account)).gallery)).toEqual(before)
		await open(page)
		await expect(lines(page)).toHaveCount(2)
		expect(await orphansOf(account)).toEqual([])
	})

	test('L7 : Entrée maintenue sur « Retirer » ne retire qu’une photo, le focus reste dans le panneau', async ({
		context,
		page,
	}) => {
		await artist(context, 4)
		await page.goto('/auth/profil')
		await open(page)

		await dialogue(page).getByRole('button', { name: 'Retirer la photo 2' }).focus()
		// A key pressed again without being released is sent with `repeat: true`.
		for (let i = 0; i < 6; i++) await page.keyboard.down('Enter')
		await page.keyboard.up('Enter')

		await expect(lines(page)).toHaveCount(3)
		await expect(dialogue(page)).toBeVisible()
		const focus = await page.evaluate(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement))
		expect(focus).toBe(true)
	})
})
