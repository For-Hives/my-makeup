import { expect, test } from '@playwright/test'
import {
	AUTRE_COULEUR,
	ajouterAuPortfolio,
	apercuProfil,
	balayer,
	choisirPhotoProfil,
	corpsDesPatchs,
	dialogue,
	erreursDeLaPage,
	fichiersStockes,
	HEIC,
	idsFichiers,
	MESSAGE_PHOTO_REFUSEE,
	MESSAGE_PHOTO_RETIREE,
	MESSAGE_PHOTO_TROP_LOURDE,
	MO,
	petitePng,
	petiteWebp,
	photoDeTelephone,
	photoTropLourde,
	sauver,
	sauverAilleurs,
} from './espace-helpers.mjs'
import { COMPTE_TEST } from './mock-api.mjs'
import {
	aller,
	appels,
	etat,
	ouvrirProfil,
	panne,
	profilDeDepart,
	profilServeur,
	reinitialiserStrapi,
} from './outils-strapi.mjs'

test.use({ testIdAttribute: 'data-cy' })

test.beforeEach(async () => {
	await reinitialiserStrapi()
})

test.describe('UI-03 photos', () => {
	registerUi03Photos26()
	registerUi03Photos27()
	registerUi03Photos28()
	registerUi03Photos29()
	registerUi03Photos30()
	registerUi03Photos31()
	registerUi03Photos32()
	registerUi03Photos33()
	registerUi03Photos34()
	registerUi03Photos35()
	registerUi03Photos36()
	registerUi03Photos37()
	registerUi03Photos38()
})

function registerUi03Photos26() {
	test('RG-04 photo de 8 Mo : compressée sous 1 Mo et 2000 px, envoyée à la sauvegarde seulement ; fermer avant ne laisse aucun fichier', async ({
		page,
	}) => {
		const photo = await photoDeTelephone()
		expect(photo.buffer.length).toBeGreaterThanOrEqual(8 * MO)
		expect(photo.buffer.length).toBeLessThan(10 * MO)

		await ouvrirProfil(page)
		await page.getByTestId('update-portefolio-button').click()
		const choix = page.getByTestId('file-upload-portefolio')
		await expect(choix).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')

		// picked and added, then the modal is closed without saving
		await choix.setInputFiles(photo)
		await expect(page.getByTestId('portfolio-preview')).toBeVisible()
		await page.getByTestId('add-button-portefolio').click()
		await expect(page.getByTestId('portfolio-pending')).toHaveText('1 photo sera envoyée quand vous sauvegarderez.')
		await page.keyboard.press('Escape')
		await expect(dialogue(page)).toBeHidden()
		let serveur = await etat()
		expect(appels(serveur.journal, 'POST', '/api/upload')).toHaveLength(0)
		expect(serveur.fichiers).toHaveLength(0)

		// the same picture, saved this time
		await page.getByTestId('update-portefolio-button').click()
		await expect(page.getByTestId('portfolio-pending')).toHaveCount(0)
		await choix.setInputFiles(photo)
		await expect(page.getByTestId('portfolio-preview')).toBeVisible()
		await page.getByTestId('add-button-portefolio').click()
		await page.getByTestId('save-button-portefolio').click()
		await expect(dialogue(page)).toBeHidden()

		serveur = await etat()
		expect(serveur.fichiers).toHaveLength(1)
		const [envoye] = serveur.fichiers
		test.info().annotations.push({
			type: 'compression',
			description: `${(photo.buffer.length / MO).toFixed(2)} Mo 4000×3000 → ${(envoye.size / 1024).toFixed(0)} Ko ${envoye.width}×${envoye.height} ${envoye.mime}`,
		})
		expect(envoye.size).toBeLessThanOrEqual(MO)
		expect(envoye.mime).toBe('image/webp')
		expect(envoye.name).toBe('img-2040.webp')
		expect(envoye.width).toBe(2000)
		expect(envoye.height).toBe(1500)
		expect(serveur.profils[COMPTE_TEST.id].image_gallery.map(f => f.id)).toEqual([envoye.id])
	})
}

function registerUi03Photos27() {
	test('HEIC refusé avec un message clair, rien n’est envoyé', async ({ page }) => {
		await ouvrirProfil(page)
		await page.getByTestId('update-portefolio-button').click()
		await page.getByTestId('file-upload-portefolio').setInputFiles(HEIC)
		const message = page.getByTestId('photo-error')
		await expect(message).toContainText('Les photos HEIC (format des iPhone)')
		await expect(message).toContainText('JPEG, PNG ou WebP')
		await expect(page.getByTestId('add-button-portefolio')).toBeDisabled()

		// the same for the profile picture, and an SVG
		await page.keyboard.press('Escape')
		await page.getByTestId('update-resume-button').click()
		await page.getByTestId('file-main-upload').setInputFiles({
			name: 'logo.svg',
			mimeType: 'image/svg+xml',
			buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
		})
		await expect(page.getByTestId('photo-error')).toHaveText(
			"Ce fichier n'est pas accepté : choisis une photo JPEG, PNG ou WebP."
		)
		expect(appels((await etat()).journal, 'POST', '/api/upload')).toHaveLength(0)
	})
}

function registerUi03Photos28() {
	test('photo de profil remplacée : la nouvelle est envoyée et rattachée à la sauvegarde, l’ancienne est supprimée', async ({
		page,
	}) => {
		// her current picture, sent before the API recorded the uploader
		const [ancienne] = await fichiersStockes(1)
		await profilDeDepart({ main_picture: ancienne.id })
		await ouvrirProfil(page)
		await page.getByTestId('update-resume-button').click()
		await expect(page.getByTestId('file-main-upload')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
		await choisirPhotoProfil(page, await petitePng())
		// nothing is sent before the save
		expect(await idsFichiers()).toEqual([ancienne.id])

		await page.getByTestId('save-button-resume').click()
		await expect(dialogue(page)).toBeHidden()
		const { fichiers, profils, journal } = await etat()
		expect(appels(journal, 'POST', '/api/upload')).toHaveLength(1)
		expect(fichiers).toHaveLength(1)
		const [nouvelle] = fichiers
		expect(nouvelle.id).not.toBe(ancienne.id)
		expect(nouvelle.mime).toBe('image/webp')
		expect(nouvelle.proprietaire).toBe(COMPTE_TEST.id)
		expect(profils[COMPTE_TEST.id].main_picture.id).toBe(nouvelle.id)
		// the old file is gone from the storage too
		expect((await fetch(ancienne.url)).status).toBe(404)
	})
}

function registerUi03Photos29() {
	test('PATCH en échec puis une autre photo choisie : la 1re reste hors du profil jusqu’au balayage, seule la 2e est rattachée', async ({
		page,
	}) => {
		await ouvrirProfil(page)
		await panne({ patch: 500 })
		await page.getByTestId('update-resume-button').click()
		await choisirPhotoProfil(page, await petitePng())
		await page.getByTestId('save-button-resume').click()
		await expect(dialogue(page).getByTestId('save-error')).toHaveText(
			"Le service est momentanément indisponible : tes modifications n'ont pas été enregistrées. Réessaie dans quelques minutes."
		)
		const [a] = (await etat()).fichiers

		// the API is back, another picture is picked and saved
		await panne({ patch: null })
		await choisirPhotoProfil(page, await petitePng(AUTRE_COULEUR))
		await page.getByTestId('save-button-resume').click()
		await expect(dialogue(page)).toBeHidden()
		const { fichiers, profils } = await etat()
		const b = fichiers.find(f => f.id !== a.id)
		expect(fichiers.map(f => f.id)).toEqual([a.id, b.id])
		expect(profils[COMPTE_TEST.id].main_picture.id).toBe(b.id)

		// A, hers and on no profile, goes at the next sweep; B stays
		expect((await balayer()).supprimes).toEqual([a.id])
		expect(await idsFichiers()).toEqual([b.id])
		expect((await profilServeur()).main_picture.id).toBe(b.id)
	})
}

function registerUi03Photos30() {
	test('photo de profil refusée par l’API (400 « File not allowed ») : « Choisis à nouveau ta photo », son id n’est jamais renvoyé, la photo choisie ensuite est envoyée et rattachée', async ({
		page,
	}) => {
		const patchs = corpsDesPatchs(page)
		await ouvrirProfil(page)
		// the upload lands on an API without uploaded_by (a rollback, or the
		// #385 deploy): no uploader recorded, so the PATCH refuses the file
		await panne({ uploadSansProprietaire: true })
		await page.getByTestId('update-resume-button').click()
		await choisirPhotoProfil(page, await petitePng())
		await page.getByTestId('save-button-resume').click()
		await expect(dialogue(page).getByTestId('save-error')).toHaveText(MESSAGE_PHOTO_REFUSEE)
		// the picked picture is dropped: back to her saved one (none)
		await expect(apercuProfil(page)).toHaveCount(0)
		const avant = await etat()
		const [refusee] = avant.fichiers
		expect(refusee.proprietaire).toBeNull()
		expect(avant.profils[COMPTE_TEST.id].main_picture).toBeNull()
		expect(avant.profils[COMPTE_TEST.id].first_name).toBe('Testine')

		// saved again without picking: the other fields, never the refused id
		await page.getByTestId('first-name-input').fill('Al')
		await page.getByTestId('save-button-resume').click()
		await expect(dialogue(page)).toBeHidden()
		expect(patchs[1]).not.toHaveProperty('main_picture')
		expect((await profilServeur()).first_name).toBe('Al')

		// picked again: uploaded again, saved
		await panne({ uploadSansProprietaire: false })
		await page.getByTestId('update-resume-button').click()
		await choisirPhotoProfil(page, await petitePng())
		await page.getByTestId('save-button-resume').click()
		await expect(dialogue(page)).toBeHidden()
		const apres = await etat()
		expect(appels(apres.journal, 'POST', '/api/upload')).toHaveLength(2)
		const nouvelle = apres.fichiers.find(f => f.id !== refusee.id)
		expect(apres.profils[COMPTE_TEST.id].main_picture.id).toBe(nouvelle.id)
		expect(patchs.map(corps => corps.main_picture)).toEqual([refusee.id, undefined, nouvelle.id])
		// a file without uploader is never swept (API #385)
		await balayer()
		expect(await idsFichiers()).toEqual([refusee.id, nouvelle.id])
	})
}

function registerUi03Photos31() {
	test('photo du portfolio refusée par l’API (400 « File not allowed ») : « Choisis à nouveau ta photo », elle quitte la galerie, les photos enregistrées restent', async ({
		page,
	}) => {
		const [enregistree] = await fichiersStockes(1)
		await profilDeDepart({ image_gallery: [enregistree.id] })
		const patchs = corpsDesPatchs(page)
		await ouvrirProfil(page)
		await panne({ uploadSansProprietaire: true })
		await page.getByTestId('update-portefolio-button').click()
		await ajouterAuPortfolio(page, await petitePng())
		await page.getByTestId('save-button-portefolio').click()
		await expect(dialogue(page).getByTestId('save-error')).toHaveText(MESSAGE_PHOTO_REFUSEE)
		await expect(dialogue(page).getByTestId('portfolio-slide')).toHaveCount(1)
		await expect(page.getByTestId('portfolio-pending')).toHaveCount(0)
		const [, refusee] = (await etat()).fichiers
		expect((await profilServeur()).image_gallery.map(photo => photo.id)).toEqual([enregistree.id])

		// added again: uploaded again, saved after the stored picture
		await panne({ uploadSansProprietaire: false })
		await ajouterAuPortfolio(page, await petitePng())
		await page.getByTestId('save-button-portefolio').click()
		await expect(dialogue(page)).toBeHidden()
		const { fichiers, profils } = await etat()
		const nouvelle = fichiers.find(f => ![enregistree.id, refusee.id].includes(f.id))
		expect(profils[COMPTE_TEST.id].image_gallery.map(photo => photo.id)).toEqual([enregistree.id, nouvelle.id])
		expect(patchs.map(corps => corps.image_gallery)).toEqual([
			[enregistree.id, refusee.id],
			[enregistree.id, nouvelle.id],
		])
	})
}

function registerUi03Photos32() {
	test('portfolio périmé : une photo enregistrée, retirée depuis un autre onglet, est refusée (400 « File not allowed ») ; « Recharge la page », elle seule quitte la galerie, la sauvegarde suivante passe', async ({
		page,
	}) => {
		const [x, y] = await fichiersStockes(2)
		await profilDeDepart({ image_gallery: [x.id, y.id] })
		const patchs = corpsDesPatchs(page)
		await ouvrirProfil(page)
		await page.getByTestId('update-portefolio-button').click()
		await expect(dialogue(page).getByTestId('portfolio-slide')).toHaveCount(2)

		// another tab removes X: the API saves [Y] and deletes X
		await sauverAilleurs({ image_gallery: [y.id] })
		expect(await idsFichiers()).toEqual([y.id])

		await ajouterAuPortfolio(page, await petitePng())
		await page.getByTestId('save-button-portefolio').click()
		await expect(dialogue(page).getByTestId('save-error')).toHaveText(MESSAGE_PHOTO_RETIREE)
		const [, nouvelle] = (await etat()).fichiers
		expect(patchs).toEqual([{ image_gallery: [x.id, y.id, nouvelle.id] }])
		// X leaves the gallery; Y and the picture sent, accepted, stay
		await expect(dialogue(page).getByTestId('portfolio-slide')).toHaveCount(2)
		await expect(page.getByTestId('portfolio-pending')).toHaveCount(0)
		expect((await profilServeur()).image_gallery.map(photo => photo.id)).toEqual([y.id])

		// saved again without a reload: X is never sent again, the picture
		// is not uploaded again
		await page.getByTestId('save-button-portefolio').click()
		await expect(dialogue(page)).toBeHidden()
		expect(patchs[1]).toEqual({ image_gallery: [y.id, nouvelle.id] })
		const { journal, profils } = await etat()
		expect(appels(journal, 'POST', '/api/upload')).toHaveLength(1)
		expect(profils[COMPTE_TEST.id].image_gallery.map(photo => photo.id)).toEqual([y.id, nouvelle.id])
	})
}

function registerUi03Photos33() {
	test('photo retirée du portfolio et sauvegardée : son fichier est supprimé, les autres restent', async ({ page }) => {
		const [premiere, seconde] = await fichiersStockes(2)
		await profilDeDepart({ image_gallery: [premiere.id, seconde.id] })
		await ouvrirProfil(page)
		await page.getByTestId('update-portefolio-button').click()
		await expect(dialogue(page).getByTestId('portfolio-slide')).toHaveCount(2)
		// closed without saving: nothing is deleted
		await dialogue(page).getByRole('button', { name: 'Retirer la photo 1' }).click()
		await expect(dialogue(page).getByTestId('portfolio-slide')).toHaveCount(1)
		await page.keyboard.press('Escape')
		await expect(dialogue(page)).toBeHidden()
		expect(await idsFichiers()).toEqual([premiere.id, seconde.id])

		await page.getByTestId('update-portefolio-button').click()
		await dialogue(page).getByRole('button', { name: 'Retirer la photo 1' }).click()
		await page.getByTestId('save-button-portefolio').click()
		await expect(dialogue(page)).toBeHidden()
		expect((await profilServeur()).image_gallery.map(photo => photo.id)).toEqual([seconde.id])
		expect(await idsFichiers()).toEqual([seconde.id])
		expect((await fetch(premiere.url)).status).toBe(404)
	})
}

function registerUi03Photos34() {
	test('photo de profil de plus de 25 Mo : refusée dans la modale, son message et son toast, la sauvegarde n’envoie aucun fichier ; refusée puis une photo valide choisie dans la même modale : le message part, celle-ci est envoyée et rattachée', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		await ouvrirProfil(page)
		await page.getByTestId('update-resume-button').click()
		await page.getByTestId('file-main-upload').setInputFiles(photoTropLourde())
		await expect(page.getByTestId('photo-error')).toHaveText(MESSAGE_PHOTO_TROP_LOURDE)
		await expect(page.locator('#photo-refusee')).toContainText(MESSAGE_PHOTO_TROP_LOURDE)

		await sauver(page, 'save-button-resume')
		let serveur = await etat()
		expect(appels(serveur.journal, 'POST', '/api/upload')).toHaveLength(0)
		expect(serveur.fichiers).toEqual([])
		expect(patchs).toHaveLength(1)
		expect(patchs[0]).not.toHaveProperty('main_picture')
		expect(serveur.profils[COMPTE_TEST.id].main_picture).toBeNull()

		// refused again, then a valid picture picked in the same modal: its
		// preview replaces the message, and the save sends it and attaches it
		await page.getByTestId('update-resume-button').click()
		await page.getByTestId('file-main-upload').setInputFiles(photoTropLourde())
		await expect(page.getByTestId('photo-error')).toHaveText(MESSAGE_PHOTO_TROP_LOURDE)
		await choisirPhotoProfil(page, await petitePng())
		await sauver(page, 'save-button-resume')
		serveur = await etat()
		expect(appels(serveur.journal, 'POST', '/api/upload')).toHaveLength(1)
		expect(serveur.fichiers).toHaveLength(1)
		const [photo] = serveur.fichiers
		expect(patchs).toHaveLength(2)
		expect(patchs[1].main_picture).toBe(photo.id)
		expect(serveur.profils[COMPTE_TEST.id].main_picture.id).toBe(photo.id)
		expect(erreurs).toEqual([])
	})
}

function registerUi03Photos35() {
	test('portfolio : une photo de plus de 25 Mo refusée, son message et son toast, rien à ajouter ; une photo valide choisie ensuite dans la même modale efface le message, s’ajoute et est envoyée à la sauvegarde', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		await ouvrirProfil(page)
		await page.getByTestId('update-portefolio-button').click()
		const vignettes = dialogue(page).getByTestId('portfolio-slide')
		const choix = page.getByTestId('file-upload-portefolio')
		await choix.setInputFiles(photoTropLourde())
		await expect(page.getByTestId('photo-error')).toHaveText(MESSAGE_PHOTO_TROP_LOURDE)
		await expect(page.locator('#photo-refusee')).toContainText(MESSAGE_PHOTO_TROP_LOURDE)
		await expect(page.getByTestId('portfolio-preview')).toHaveCount(0)
		await expect(page.getByTestId('add-button-portefolio')).toBeDisabled()
		await expect(vignettes).toHaveCount(0)

		const photo = await petiteWebp(0)
		await choix.setInputFiles(photo)
		await expect(page.getByTestId('portfolio-preview')).toBeVisible()
		await expect(page.getByTestId('photo-error')).toHaveCount(0)
		await page.getByTestId('add-button-portefolio').click()
		await expect(vignettes).toHaveCount(1)
		await expect(page.getByTestId('portfolio-pending')).toHaveText('1 photo sera envoyée quand vous sauvegarderez.')
		expect(appels((await etat()).journal, 'POST', '/api/upload')).toHaveLength(0)

		await sauver(page, 'save-button-portefolio')
		const { journal, fichiers, profils } = await etat()
		expect(appels(journal, 'POST', '/api/upload')).toHaveLength(1)
		expect(fichiers.map(f => f.name)).toEqual([photo.name])
		const [envoyee] = fichiers
		expect(patchs).toEqual([{ image_gallery: [envoyee.id] }])
		expect(profils[COMPTE_TEST.id].image_gallery.map(f => f.id)).toEqual([envoyee.id])
		expect(erreurs).toEqual([])
	})
}

function registerUi03Photos36() {
	test('portfolio : 10 photos WebP ajoutées, la 11e refusée ; les 10 envoyées à la sauvegarde, dans l’ordre ; toutes retirées ensuite, la galerie vide enregistrée et leurs fichiers supprimés', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		test.slow()
		const patchs = corpsDesPatchs(page)
		await ouvrirProfil(page)
		await page.getByTestId('update-portefolio-button').click()
		const vignettes = dialogue(page).getByTestId('portfolio-slide')
		const photos = await Promise.all(Array.from({ length: 11 }, (_, n) => petiteWebp(n)))
		for (const [n, photo] of photos.slice(0, 10).entries()) {
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			await ajouterAuPortfolio(page, photo)
			await expect(vignettes).toHaveCount(n + 1)
		}
		await expect(page.getByTestId('photo-error')).toHaveCount(0)
		await expect(page.getByTestId('portfolio-pending')).toHaveText(
			'10 photos seront envoyées quand vous sauvegarderez.'
		)

		// the 11th: picked, then refused by « Ajouter »
		await page.getByTestId('file-upload-portefolio').setInputFiles(photos[10])
		await expect(page.getByTestId('portfolio-preview')).toBeVisible()
		await page.getByTestId('add-button-portefolio').click()
		await expect(page.getByTestId('photo-error')).toHaveText(
			'Ton portfolio contient déjà 10 photos : retires-en une pour en ajouter une autre.'
		)
		await expect(vignettes).toHaveCount(10)
		expect(appels((await etat()).journal, 'POST', '/api/upload')).toHaveLength(0)

		await sauver(page, 'save-button-portefolio')
		const { journal, fichiers, profils } = await etat()
		expect(appels(journal, 'POST', '/api/upload')).toHaveLength(10)
		expect(fichiers.map(f => f.mime)).toEqual(Array(10).fill('image/webp'))
		// uploaded in the order added, saved in that order
		expect(fichiers.map(f => f.name)).toEqual(photos.slice(0, 10).map(p => p.name))
		const ids = fichiers.map(f => f.id)
		expect(profils[COMPTE_TEST.id].image_gallery.map(f => f.id)).toEqual(ids)
		expect(patchs).toEqual([{ image_gallery: ids }])

		// every picture removed, the empty gallery saved
		await page.getByTestId('update-portefolio-button').click()
		await expect(vignettes).toHaveCount(10)
		for (let n = 10; n > 0; n--) {
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			await dialogue(page).getByRole('button', { name: 'Retirer la photo 1', exact: true }).click()
			await expect(vignettes).toHaveCount(n - 1)
		}
		await sauver(page, 'save-button-portefolio')
		expect(patchs[1]).toEqual({ image_gallery: [] })
		expect((await profilServeur()).image_gallery).toEqual([])
		expect(await idsFichiers()).toEqual([])
		for (const f of fichiers) {
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			expect((await fetch(f.url)).status).toBe(404)
		}

		await aller(page, '/auth/profil')
		await page.getByTestId('update-portefolio-button').click()
		await expect(dialogue(page)).toBeVisible()
		await expect(vignettes).toHaveCount(0)
		expect(erreurs).toEqual([])
	})
}

function registerUi03Photos37() {
	test('portfolio de 10 photos enregistrées : la 11e refusée, rien n’est envoyé ; une photo retirée, celle choisie s’ajoute sans la choisir à nouveau et remplace l’autre à la sauvegarde', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const stockees = await fichiersStockes(10)
		await profilDeDepart({ image_gallery: stockees.map(f => f.id) })
		await ouvrirProfil(page)
		await page.getByTestId('update-portefolio-button').click()
		const vignettes = dialogue(page).getByTestId('portfolio-slide')
		await expect(vignettes).toHaveCount(10)

		await page.getByTestId('file-upload-portefolio').setInputFiles(await petiteWebp(0))
		await expect(page.getByTestId('portfolio-preview')).toBeVisible()
		await page.getByTestId('add-button-portefolio').click()
		await expect(page.getByTestId('photo-error')).toHaveText(
			'Ton portfolio contient déjà 10 photos : retires-en une pour en ajouter une autre.'
		)
		await expect(vignettes).toHaveCount(10)
		await expect(page.getByTestId('portfolio-pending')).toHaveCount(0)
		// the picked picture is kept for later
		await expect(page.getByTestId('add-button-portefolio')).toBeEnabled()
		expect(appels((await etat()).journal, 'POST', '/api/upload')).toHaveLength(0)

		await dialogue(page).getByRole('button', { name: 'Retirer la photo 1', exact: true }).click()
		await expect(vignettes).toHaveCount(9)
		await page.getByTestId('add-button-portefolio').click()
		await expect(vignettes).toHaveCount(10)
		await expect(page.getByTestId('portfolio-pending')).toHaveText('1 photo sera envoyée quand vous sauvegarderez.')

		await sauver(page, 'save-button-portefolio')
		const { journal, fichiers, profils } = await etat()
		expect(appels(journal, 'POST', '/api/upload')).toHaveLength(1)
		const nouvelle = fichiers.find(f => !stockees.some(s => s.id === f.id))
		expect(nouvelle.mime).toBe('image/webp')
		expect(profils[COMPTE_TEST.id].image_gallery.map(f => f.id)).toEqual([
			...stockees.slice(1).map(f => f.id),
			nouvelle.id,
		])
		expect((await fetch(stockees[0].url)).status).toBe(404)
		expect(erreurs).toEqual([])
	})
}

function registerUi03Photos38() {
	test('envoi refusé par l’API (413) : message, rien n’est rattaché', async ({ page }) => {
		await ouvrirProfil(page)
		await panne({ upload: 413 })
		await page.getByTestId('update-portefolio-button').click()
		await page.getByTestId('file-upload-portefolio').setInputFiles(await petitePng())
		await page.getByTestId('add-button-portefolio').click()
		await page.getByTestId('save-button-portefolio').click()
		await expect(dialogue(page).getByTestId('save-error')).toHaveText(
			'La photo dépasse 10 Mo : choisis-en une plus légère.'
		)
		const { journal, profils } = await etat()
		expect(appels(journal, 'PATCH', '/api/me-makeup')).toHaveLength(0)
		expect(profils[COMPTE_TEST.id].image_gallery).toHaveLength(0)
	})
}
