import { expect, type Page, test } from '@playwright/test'
import sharp from 'sharp'
import { MESSAGES_PHOTO } from '@/lib/espace/photo'
import { photosNommees } from '@/lib/profil/photos'
import { violationsGraves } from '../outils/axe'
import { type CompteDeTest, creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest } from '../outils/payload-test'
import { fichierPourPayload } from '../outils/photos'
import { lireUnObjet } from '../outils/s3'

/**
 * The portfolio in her space (tickets 135 and 136; plan 02 E34, E35, E36, U80): several photos
 * chosen at once, sent at « Enregistrer » only, ten at most, in the order they were added, on her
 * space and on her public profile; a file that is refused is set aside without losing the others.
 * Made-up people and photos.
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

/** A commune of the official list: the city a profile needs to be active. */
const ANNECY = { nom: 'Annecy', codeInsee: '74010' } as const

let compteur = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${150 + (++compteur % 50)}` })
)

type Maquilleuse = CompteDeTest<'maquilleuse'>

/** A makeup artist whose profile is published, with `deja` photos already in her portfolio. */
async function maquilleuse(
	context: { addCookies: (c: Maquilleuse['session']['cookies']) => Promise<void> },
	deja = 0
): Promise<{ compte: Maquilleuse; slug: string }> {
	const compte = await creerCompte('maquilleuse')
	const payload = await payloadDeTest()
	const { docs } = await payload.find({ collection: 'profils', depth: 0, where: { pro: { equals: compte.id } } })
	const [fiche] = docs
	if (!fiche) throw new Error('pas de profil')
	const galerie: number[] = []
	for (let i = 0; i < deja; i++) {
		const media = await payload.create({
			collection: 'media',
			data: { owner: Number(compte.id), alt: 'Photo du portfolio' },
			file: fichierPourPayload(),
		})
		galerie.push(media.id)
	}
	const profil = await payload.update({
		collection: 'profils',
		id: fiche.id,
		data: { prenom: 'Léa', nom: 'Fictive', specialite: 'Mariée', commune: ANNECY, galerie },
	})
	await context.addCookies(compte.session.cookies)
	return { compte, slug: profil.slug ?? '' }
}

async function profilStocke(compte: Maquilleuse) {
	const payload = await payloadDeTest()
	const { docs } = await payload.find({ collection: 'profils', depth: 0, where: { pro: { equals: compte.id } } })
	const profil = docs[0]
	if (!profil) throw new Error('pas de profil')
	return profil
}

/** The media of this account only: the two projects share the bench and run side by side. */
async function mediasDe(compte: Maquilleuse) {
	const payload = await payloadDeTest()
	return (
		await payload.find({ collection: 'media', depth: 0, pagination: false, where: { owner: { equals: compte.id } } })
	).docs
}

/** The media of this account that nothing references: the orphans of the test. */
async function orphelinsDe(compte: Maquilleuse): Promise<number[]> {
	const profil = await profilStocke(compte)
	const utilises = new Set([...photosNommees(profil.galerie), ...photosNommees(profil.photoPrincipale)].map(String))
	return (await mediasDe(compte)).filter(media => !utilises.has(String(media.id))).map(media => media.id)
}

/** A real PNG of this width: the width tells the photos apart once stored. */
const png = (largeur: number) =>
	sharp({ create: { width: largeur, height: 600, channels: 3, background: { r: largeur % 255, g: 120, b: 150 } } })
		.png()
		.toBuffer()

const fichierPng = async (largeur: number) => ({
	name: `photo-${largeur}.png`,
	mimeType: 'image/png',
	buffer: await png(largeur),
})

const modifier = (page: Page) => page.getByRole('button', { name: 'Modifier mon portfolio' })
const dialogue = (page: Page) => page.getByRole('dialog', { name: 'Modifier mon portfolio' })

async function ouvrir(page: Page) {
	if (test.info().project.name === 'mobile') await modifier(page).tap()
	else await modifier(page).click()
	await expect(dialogue(page)).toBeVisible()
}

/** The requests that send a photo to the server. */
function envois(page: Page): string[] {
	const liste: string[] = []
	page.on('request', requete => {
		if (requete.method() === 'POST' && new URL(requete.url()).pathname === '/api/media') liste.push(requete.url())
	})
	return liste
}

const lignes = (page: Page) =>
	dialogue(page)
		.locator('li')
		.filter({ has: page.locator('img') })

test.describe('135 : le portfolio, ajouter des photos', { tag: '@mobile' }, () => {
	test('E34 : trois photos choisies d’un coup, enregistrées dans l’ordre, visibles dans l’espace et en public', async ({
		context,
		page,
	}) => {
		test.setTimeout(120_000)
		const { compte, slug } = await maquilleuse(context)
		await page.goto('/auth/profil')
		await expect(page.getByTestId('carte-portfolio')).toContainText('à compléter')
		await ouvrir(page)
		const envoyes = envois(page)

		await page
			.getByLabel('Ajouter des photos')
			.setInputFiles([await fichierPng(801), await fichierPng(802), await fichierPng(803)])
		await expect(lignes(page)).toHaveCount(3, { timeout: 30_000 })
		await expect(dialogue(page).getByText('À enregistrer')).toHaveCount(3)
		expect(envoyes).toHaveLength(0)
		expect(await violationsGraves(page)).toEqual([])
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(dialogue(page)).toHaveCount(0, { timeout: 60_000 })
		await expect(page.getByRole('status').filter({ hasText: 'Ton portfolio est enregistré.' })).toBeVisible()
		await expect(modifier(page)).toBeFocused()
		await expect(page.getByTestId('carte-portfolio')).toContainText('3 photos')
		expect(envoyes).toHaveLength(3)

		// Stored in the order they were added, with their default alternative text.
		const profil = await profilStocke(compte)
		const payload = await payloadDeTest()
		const stockees = await Promise.all(
			photosNommees(profil.galerie).map(id => payload.findByID({ collection: 'media', id: Number(id), depth: 0 }))
		)
		expect(stockees.map(media => media.width)).toEqual([801, 802, 803])
		expect(stockees.map(media => media.alt)).toEqual(['Photo du portfolio', 'Photo du portfolio', 'Photo du portfolio'])
		expect(await orphelinsDe(compte)).toEqual([])

		await page.reload()
		await ouvrir(page)
		await expect(lignes(page)).toHaveCount(3)
		await expect(dialogue(page).getByText('À enregistrer')).toHaveCount(0)
		await page.keyboard.press('Escape')

		await page.goto(`/profil/${slug}`)
		for (const rang of [1, 2, 3]) {
			const image = page.getByRole('img', { name: `Réalisation de Léa Fictive (${rang}/3)` })
			await expect(image).toBeAttached()
		}

		const dossier = process.env.CAPTURES_ESPACE
		if (dossier) {
			await page.goto('/auth/profil')
			await ouvrir(page)
			await page.screenshot({ path: `${dossier}/portfolio-${test.info().project.name}.png` })
		}
	})

	test('U80 : la 11e photo est refusée, les autres sont gardées ; E36 : un PDF est écarté sans perdre les autres', async ({
		context,
		page,
	}) => {
		test.setTimeout(120_000)
		const { compte } = await maquilleuse(context, 8)
		await page.goto('/auth/profil')
		await ouvrir(page)
		const envoyes = envois(page)

		await page
			.getByLabel('Ajouter des photos')
			.setInputFiles([
				await fichierPng(811),
				{ name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n') },
				await fichierPng(812),
				await fichierPng(813),
			])

		await expect(lignes(page)).toHaveCount(10, { timeout: 30_000 })
		const alertes = page.getByRole('alert')
		await expect(alertes.filter({ hasText: `cv.pdf : ${MESSAGES_PHOTO.type}` })).toBeVisible()
		await expect(alertes.filter({ hasText: `photo-813.png : ${MESSAGES_PHOTO['limite-galerie']}` })).toBeVisible()
		expect(envoyes).toHaveLength(0)

		await page.getByRole('button', { name: 'Enregistrer' }).click()
		await expect(dialogue(page)).toHaveCount(0, { timeout: 60_000 })
		expect(envoyes).toHaveLength(2)
		expect(photosNommees((await profilStocke(compte)).galerie)).toHaveLength(10)
		expect(await orphelinsDe(compte)).toEqual([])
	})

	test('E34 : fermer sans valider n’envoie rien : aucun objet, aucun média de plus, 0 orphelin', async ({
		context,
		page,
	}) => {
		const { compte } = await maquilleuse(context, 1)
		const avant = (await mediasDe(compte)).length
		const envoyes = envois(page)
		await page.goto('/auth/profil')
		await ouvrir(page)

		await page.getByLabel('Ajouter des photos').setInputFiles([await fichierPng(821), await fichierPng(822)])
		await expect(lignes(page)).toHaveCount(3, { timeout: 30_000 })
		await page.getByRole('button', { name: 'Fermer' }).click()
		await page.getByRole('button', { name: 'Abandonner mes modifications' }).click()

		await expect(dialogue(page)).toHaveCount(0)
		expect(envoyes).toHaveLength(0)
		expect((await mediasDe(compte)).length).toBe(avant)
		expect(photosNommees((await profilStocke(compte)).galerie)).toHaveLength(1)
		expect(await orphelinsDe(compte)).toEqual([])
		await ouvrir(page)
		await expect(lignes(page)).toHaveCount(1)
	})

	test('coupure pendant l’envoi : le portfolio reste comme il était, aucun orphelin', async ({ context, page }) => {
		const { compte } = await maquilleuse(context, 1)
		await page.goto('/auth/profil')
		await ouvrir(page)
		// The second file never gets there.
		let n = 0
		await page.route('**/api/media*', route => {
			if (route.request().method() !== 'POST') return route.continue()
			return ++n === 2 ? route.abort() : route.continue()
		})

		await page.getByLabel('Ajouter des photos').setInputFiles([await fichierPng(831), await fichierPng(832)])
		await expect(lignes(page)).toHaveCount(3, { timeout: 30_000 })
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(page.getByRole('alert').filter({ hasText: MESSAGES_PHOTO['envoi-impossible'] })).toBeVisible()
		await expect(dialogue(page)).toBeVisible()
		await expect.poll(async () => (await mediasDe(compte)).length).toBe(1)
		expect(photosNommees((await profilStocke(compte)).galerie)).toHaveLength(1)
		expect(await orphelinsDe(compte)).toEqual([])
	})
})

test.describe('136 : le portfolio, retirer une photo', { tag: '@mobile' }, () => {
	test('E35 : la photo retirée disparaît de l’espace et du profil public, son objet est en corbeille, 0 orphelin', async ({
		context,
		page,
	}) => {
		test.setTimeout(120_000)
		const { compte, slug } = await maquilleuse(context, 3)
		const payload = await payloadDeTest()
		const avant = photosNommees((await profilStocke(compte)).galerie)
		const retiree = await payload.findByID({ collection: 'media', id: Number(avant[1]), depth: 0 })
		const octets = (await lireUnObjet(`media/${retiree.filename}`))?.octets
		expect(octets).toBeDefined()
		await page.goto('/auth/profil')
		await expect(page.getByTestId('carte-portfolio')).toContainText('3 photos')
		await ouvrir(page)

		await page.getByRole('button', { name: 'Retirer la photo 2' }).click()
		await expect(lignes(page)).toHaveCount(2)
		await expect(dialogue(page).getByTestId('annonce-retrait')).toContainText(
			'Photo 2 sur 3 de ton portfolio est retirée'
		)
		// The focus stays in the panel, on the photo that takes the place of the one removed.
		await expect(dialogue(page).getByRole('button', { name: 'Retirer la photo 2' })).toBeFocused()
		expect(photosNommees((await profilStocke(compte)).galerie)).toHaveLength(3)
		expect(await violationsGraves(page)).toEqual([])
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(dialogue(page)).toHaveCount(0, { timeout: 60_000 })
		await expect(page.getByTestId('carte-portfolio')).toContainText('2 photos')
		expect(photosNommees((await profilStocke(compte)).galerie)).toEqual([avant[0], avant[2]])
		expect(await lireUnObjet(`media/${retiree.filename}`)).toBeUndefined()
		expect((await lireUnObjet(`deleted/media/${retiree.filename}`))?.octets).toEqual(octets)
		expect(await orphelinsDe(compte)).toEqual([])

		await page.goto(`/profil/${slug}`)
		await expect(page.getByRole('img', { name: /^Réalisation de Léa Fictive \(\d\/2\)$/ })).toHaveCount(2, {
			timeout: 30_000,
		})
		await expect(page.getByRole('img', { name: /\(\d\/3\)$/ })).toHaveCount(0)
	})

	test('retirer puis fermer sans valider : la photo est toujours là, rien n’a changé', async ({ context, page }) => {
		const { compte } = await maquilleuse(context, 2)
		const avant = photosNommees((await profilStocke(compte)).galerie)
		await page.goto('/auth/profil')
		await ouvrir(page)

		await page.getByRole('button', { name: 'Retirer la photo 1' }).click()
		await expect(lignes(page)).toHaveCount(1)
		await page.getByRole('button', { name: 'Fermer' }).click()
		await page.getByRole('button', { name: 'Abandonner mes modifications' }).click()
		await expect(dialogue(page)).toHaveCount(0)

		expect(photosNommees((await profilStocke(compte)).galerie)).toEqual(avant)
		await ouvrir(page)
		await expect(lignes(page)).toHaveCount(2)
		expect(await orphelinsDe(compte)).toEqual([])
	})

	test('L7 : Entrée maintenue sur « Retirer » ne retire qu’une photo, le focus reste dans le panneau', async ({
		context,
		page,
	}, info) => {
		test.skip(info.project.name === 'mobile', 'Une touche tenue enfoncée est un geste de clavier.')
		await maquilleuse(context, 4)
		await page.goto('/auth/profil')
		await ouvrir(page)

		await dialogue(page).getByRole('button', { name: 'Retirer la photo 2' }).focus()
		// A key pressed again without being released is sent with `repeat: true`.
		for (let i = 0; i < 6; i++) await page.keyboard.down('Enter')
		await page.keyboard.up('Enter')

		await expect(lignes(page)).toHaveCount(3)
		await expect(dialogue(page)).toBeVisible()
		const focus = await page.evaluate(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement))
		expect(focus).toBe(true)
	})
})
