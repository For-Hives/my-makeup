// The artist's space in a real browser against the fake Strapi
// (tests/regression/mock-api.mjs), launched by tests/regression/run.mjs:
// honest saves (UI-01, RG-01 to RG-03), editing with a finger and the
// keyboard (UI-02, UI-04, RG-05, RG-06), pictures (UI-03, RG-04), onboarding
// and deletion (UI-05, RG-07) and the forgotten password (A7, S12).
// Web-first waits only, no fixed timeout.
import { expect, test, devices } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { COMPTE_TEST } from './mock-api.mjs'

const API = process.env.RG_API ?? 'http://127.0.0.1:4112'
const MO = 1024 * 1024

// Never against the production: local hosts only
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(API).hostname))
	throw new Error(`API non locale refusée : ${API}`)

test.use({ testIdAttribute: 'data-cy' })

// --- the fake Strapi ---
async function piloter(chemin, corps) {
	const reponse = await fetch(
		API + chemin,
		corps === undefined ? {} : { method: 'POST', body: JSON.stringify(corps) }
	)
	return reponse.json()
}
const etat = () => piloter('/__etat')
const panne = corps => piloter('/__panne', corps)
const profilServeur = async (id = COMPTE_TEST.id) => (await etat()).profils[id]
const appels = (journal, methode, chemin) =>
	journal.filter(entree => entree.m === methode && entree.p === chemin)

test.beforeEach(async () => {
	await piloter('/__reset', {})
})

// --- sessions and pages ---
async function connecter(
	page,
	{ email = COMPTE_TEST.email, password = COMPTE_TEST.password } = {}
) {
	const requete = page.context().request
	const { csrfToken } = await (await requete.get('/api/auth/csrf')).json()
	await requete.post('/api/auth/callback/credentials', {
		form: { csrfToken, email, password, json: 'true' },
	})
	const cookies = await page.context().cookies()
	return cookies.some(c => c.name.startsWith('next-auth.session-token'))
}

// Loads a page and waits for its hydration (SessionProvider asks for the
// session once React runs): a click before that would do nothing.
async function aller(page, chemin) {
	const session = page.waitForResponse(r =>
		r.url().endsWith('/api/auth/session')
	)
	await page.goto(chemin)
	await session
}

async function ouvrirProfil(page) {
	expect(await connecter(page)).toBe(true)
	await aller(page, '/auth/profil')
	await expect(page.getByTestId('resume-name')).toHaveText('Testine Recette')
}

// the open modal (its Dialog element has no size of its own)
const dialogue = page => page.getByTestId('modal-panel')

// --- pictures ---
// A phone-like JPEG of 4000×3000 px and about 8 MB: gradients, a pattern
// and sensor-like noise (pure noise would not compress like a photo).
async function photoDeTelephone() {
	const largeur = 4000
	const hauteur = 3000
	const amplitude = 20
	const bruit = randomBytes(largeur * hauteur)
	const brut = Buffer.alloc(largeur * hauteur * 3)
	for (let y = 0; y < hauteur; y++)
		for (let x = 0; x < largeur; x++) {
			const i = y * largeur + x
			const n = (bruit[i] % (2 * amplitude + 1)) - amplitude
			const borne = v => Math.min(255, Math.max(0, v | 0))
			brut[i * 3] = borne((x * 255) / largeur + n)
			brut[i * 3 + 1] = borne((y * 255) / hauteur + n)
			brut[i * 3 + 2] = borne(
				128 + 60 * Math.sin(x / 90) * Math.cos(y / 70) + n
			)
		}
	const buffer = await sharp(brut, {
		raw: { width: largeur, height: hauteur, channels: 3 },
	})
		.jpeg({ quality: 99 })
		.toBuffer()
	return { name: 'IMG_2040.JPG', mimeType: 'image/jpeg', buffer }
}

async function petitePng() {
	const buffer = await sharp({
		create: {
			width: 1200,
			height: 1200,
			channels: 3,
			background: { r: 200, g: 120, b: 160 },
		},
	})
		.png()
		.toBuffer()
	return { name: 'portrait.png', mimeType: 'image/png', buffer }
}

// first bytes of an iPhone HEIC (ISO BMFF, brand heic), then anything
const HEIC = {
	name: 'IMG_0001.HEIC',
	mimeType: 'image/heic',
	buffer: Buffer.concat([
		Buffer.from([0, 0, 0, 0x18]),
		Buffer.from('ftypheic'),
		randomBytes(3 * MO),
	]),
}

test.describe('UI-01 sauvegardes honnêtes', () => {
	test('RG-01 sauvegarde réussie : la page, puis le rechargement, montrent ce que l’API a enregistré', async ({
		page,
	}) => {
		await ouvrirProfil(page)
		await page.getByTestId('update-description-button').click()
		const champ = page.getByTestId('description-input')
		await champ.fill('Nouvelle description enregistrée')
		await page.getByTestId('save-button-description').click()

		await expect(page.getByText('Modifications enregistrées.')).toBeVisible()
		await expect(champ).toBeHidden()
		await expect(page.getByTestId('description').first()).toHaveText(
			'Nouvelle description enregistrée'
		)
		expect((await profilServeur()).description).toBe(
			'Nouvelle description enregistrée'
		)

		await aller(page, '/auth/profil')
		await expect(page.getByTestId('description').first()).toHaveText(
			'Nouvelle description enregistrée'
		)
	})

	test('RG-01 PATCH en 500 : message dans la modale, saisie gardée, page et API inchangées, nouvel essai réussi', async ({
		page,
	}) => {
		await ouvrirProfil(page)
		await panne({ patch: 500 })
		await page.getByTestId('update-description-button').click()
		const champ = page.getByTestId('description-input')
		await champ.fill('Texte qui ne sera pas enregistré')
		await page.getByTestId('save-button-description').click()

		const alerte = dialogue(page).getByTestId('save-error')
		await expect(alerte).toHaveText(
			"Le service est momentanément indisponible : tes modifications n'ont pas été enregistrées. Réessaie dans quelques minutes."
		)
		await expect(alerte).toHaveAttribute('role', 'alert')
		// nothing typed is lost, and the page still shows the stored text
		await expect(champ).toHaveValue('Texte qui ne sera pas enregistré')
		await expect(page.getByTestId('description').first()).toHaveText(
			'Description initiale'
		)
		await expect(page.getByTestId('save-button-description')).toBeEnabled()
		expect((await profilServeur()).description).toBe('Description initiale')

		// the API is back: the same text is saved without typing it again
		await panne({ patch: null })
		await page.getByTestId('save-button-description').click()
		await expect(champ).toBeHidden()
		await expect(page.getByTestId('description').first()).toHaveText(
			'Texte qui ne sera pas enregistré'
		)
		expect((await profilServeur()).description).toBe(
			'Texte qui ne sera pas enregistré'
		)
	})

	test('RG-01 PATCH en échec puis modale fermée : la page garde la valeur enregistrée', async ({
		page,
	}) => {
		await ouvrirProfil(page)
		await panne({ patch: 500 })
		await page.getByTestId('update-location-button').click()
		await page.getByTestId('city-input').fill('Chambéry')
		await page.getByTestId('save-button-location').click()
		await expect(dialogue(page).getByTestId('save-error')).toBeVisible()
		await page.keyboard.press('Escape')
		await expect(dialogue(page)).toBeHidden()
		await expect(
			page.getByTestId('location-city-action-radius').first()
		).toContainText('Annecy')
		expect((await profilServeur()).city).toBe('Annecy')
	})

	test('RG-02 prénom : 1 lettre refusée par le formulaire sans appel ; 2 lettres envoyées, la règle actuelle de l’API (3) affichée', async ({
		page,
	}) => {
		await ouvrirProfil(page)
		await page.getByTestId('update-resume-button').click()
		const prenom = page.getByTestId('first-name-input')

		await prenom.fill('A')
		await page.getByTestId('save-button-resume').click()
		await expect(page.getByTestId('error-first-name')).toHaveText(
			'Le prénom doit contenir au moins 2 caractères.'
		)
		expect(
			appels((await etat()).journal, 'PATCH', '/api/me-makeup')
		).toHaveLength(0)

		// accepted by the form (2 characters); the API of today still asks for
		// 3 (schema.json, minLength 3): its refusal is shown, nothing changes
		await prenom.fill('Al')
		await page.getByTestId('save-button-resume').click()
		await expect(dialogue(page).getByTestId('save-error')).toHaveText(
			'Le prénom doit contenir au moins 3 caractères.'
		)
		await expect(page.getByTestId('resume-name')).toHaveText('Testine Recette')
		expect((await profilServeur()).first_name).toBe('Testine')
	})

	test('RG-03 expérience modifiée puis modale fermée sans sauvegarder : valeur d’origine partout', async ({
		page,
	}) => {
		await ouvrirProfil(page)
		await page.getByTestId('update-experience-button').click()
		await page.getByTestId('experience-selected-0').click()
		await page.getByTestId('company-input').fill('Studio MODIFIE')
		await page.getByTestId('add-experience-button').click()
		await expect(dialogue(page)).toContainText('Studio MODIFIE')

		await page.keyboard.press('Escape')
		await expect(dialogue(page)).toBeHidden()
		await expect(page.getByTestId('experience-company').first()).toHaveText(
			'Studio A'
		)
		await page.getByTestId('update-experience-button').click()
		await expect(dialogue(page)).toContainText('Studio A')
		await expect(dialogue(page)).not.toContainText('Studio MODIFIE')

		const { journal, profils } = await etat()
		expect(appels(journal, 'PATCH', '/api/me-makeup')).toHaveLength(0)
		expect(profils[COMPTE_TEST.id].experiences[0].company).toBe('Studio A')
	})

	test('expérience modifiée et sauvegardée : envoyée, affichée, et encore modifiable', async ({
		page,
	}) => {
		await ouvrirProfil(page)
		await page.getByTestId('update-experience-button').click()
		await page.getByTestId('experience-selected-0').click()
		await page.getByTestId('company-input').fill('Studio B')
		await page.getByTestId('add-experience-button').click()
		await page.getByTestId('save-button-experience').click()
		await expect(dialogue(page)).toBeHidden()
		await expect(page.getByTestId('experience-company').first()).toHaveText(
			'Studio B'
		)
		expect((await profilServeur()).experiences[0].company).toBe('Studio B')

		// the saved item can be edited again without reloading
		await page.getByTestId('update-experience-button').click()
		await page.getByTestId('experience-selected-0').click()
		await expect(page.getByTestId('company-input')).toHaveValue('Studio B')
	})
})

test.describe('UI-02 et UI-04 édition au doigt et au clavier', () => {
	test('RG-05 clavier : le bouton « Modifier » est visible au focus, Entrée ouvre, Échap et clic dehors ferment, défilement bloqué', async ({
		page,
	}) => {
		await ouvrirProfil(page)
		const bouton = page.getByTestId('update-description-button')

		// reached with Tab only
		let atteint = false
		for (let i = 0; i < 80 && !atteint; i++) {
			await page.keyboard.press('Tab')
			atteint = await bouton.evaluate(b => document.activeElement === b)
		}
		expect(atteint).toBe(true)
		await expect(bouton).toBeVisible()
		await expect(bouton).toBeInViewport()
		const style = await bouton.evaluate(b => {
			const cs = getComputedStyle(b)
			const r = b.getBoundingClientRect()
			return {
				opacity: cs.opacity,
				anneau: cs.boxShadow,
				largeur: r.width,
				hauteur: r.height,
			}
		})
		expect(style.opacity).toBe('1')
		expect(style.anneau).not.toBe('none') // focus-visible ring
		expect(style.largeur).toBeGreaterThanOrEqual(44)
		expect(style.hauteur).toBeGreaterThanOrEqual(44)
		await expect(bouton).toHaveAccessibleName('Modifier votre description')

		await page.keyboard.press('Enter')
		const champ = page.getByTestId('description-input')
		await expect(champ).toBeVisible()
		// labels are linked to their field
		await expect(page.getByLabel('Description', { exact: true })).toBeVisible()
		// translucent backdrop (UI-04) and page scroll locked
		await expect(page.getByTestId('modal-backdrop')).toHaveCSS(
			'background-color',
			'rgba(107, 114, 128, 0.75)'
		)
		const defilement = () =>
			page.evaluate(() => getComputedStyle(document.documentElement).overflow)
		await expect.poll(defilement).toBe('hidden')
		await expect(page.getByRole('button', { name: 'Fermer' })).toBeVisible()

		await page.keyboard.press('Escape')
		await expect(champ).toBeHidden()
		await expect.poll(defilement).not.toBe('hidden')

		// a click outside the panel closes it too
		await bouton.click()
		await expect(champ).toBeVisible()
		await page.mouse.click(5, 5)
		await expect(champ).toBeHidden()
	})

	test('toutes les cartes ont un bouton « Modifier » visible de 44 px', async ({
		page,
	}) => {
		await ouvrirProfil(page)
		for (const cy of [
			'update-resume-button',
			'update-location-button',
			'update-social-medias-button',
			'update-skills-button',
			'update-languages-button',
			'update-courses-button',
			'update-description-button',
			'update-portefolio-button',
			'update-service-offers-button',
			'update-experience-button',
		]) {
			const bouton = page.getByTestId(cy)
			await expect(bouton, cy).toBeVisible()
			const boite = await bouton.boundingBox()
			expect(boite.height, cy).toBeGreaterThanOrEqual(44)
			expect(await bouton.evaluate(b => getComputedStyle(b).opacity), cy).toBe(
				'1'
			)
		}
	})

	test.describe('sur un téléphone', () => {
		// eslint-disable-next-line no-unused-vars
		const { defaultBrowserType, ...iphone } = devices['iPhone 13']
		test.use(iphone)

		test('RG-05 le premier tap ouvre la modale', async ({ page }) => {
			await ouvrirProfil(page)
			const bouton = page.getByTestId('update-description-button')
			await bouton.scrollIntoViewIfNeeded()
			await bouton.tap()
			await expect(page.getByTestId('description-input')).toBeVisible()
		})

		test('aucun débordement horizontal de l’espace', async ({ page }) => {
			await ouvrirProfil(page)
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= window.innerWidth + 1
				)
			).toBe(true)
		})
	})

	for (const largeur of [390, 1024, 1440]) {
		test(`RG-06 « Voir mon profil public » cliquable à ${largeur} px`, async ({
			page,
		}) => {
			await page.setViewportSize({ width: largeur, height: 900 })
			await ouvrirProfil(page)
			const lien = page.getByTestId('profil-public-view')
			await lien.scrollIntoViewIfNeeded()
			// nothing covers its center
			expect(
				await lien.evaluate(a => {
					const r = a.getBoundingClientRect()
					return a.contains(
						document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
					)
				})
			).toBe(true)
			expect((await lien.boundingBox()).height).toBeGreaterThanOrEqual(44)
			await lien.click()
			await expect(page).toHaveURL(/publicView=true/)
			await expect(page.getByTestId('profil-edit-view')).toBeVisible()
			await expect(page.getByTestId('update-description-button')).toHaveCount(0)
		})
	}
})

test.describe('UI-03 photos', () => {
	test('RG-04 photo de 8 Mo : compressée sous 1 Mo et 2000 px, envoyée à la sauvegarde seulement ; fermer avant ne laisse aucun fichier', async ({
		page,
	}) => {
		const photo = await photoDeTelephone()
		expect(photo.buffer.length).toBeGreaterThanOrEqual(8 * MO)
		expect(photo.buffer.length).toBeLessThan(10 * MO)

		await ouvrirProfil(page)
		await page.getByTestId('update-portefolio-button').click()
		const choix = page.getByTestId('file-upload-portefolio')
		await expect(choix).toHaveAttribute(
			'accept',
			'image/jpeg,image/png,image/webp'
		)

		// picked and added, then the modal is closed without saving
		await choix.setInputFiles(photo)
		await expect(page.getByTestId('portfolio-preview')).toBeVisible()
		await page.getByTestId('add-button-portefolio').click()
		await expect(page.getByTestId('portfolio-pending')).toHaveText(
			'1 photo sera envoyée quand vous sauvegarderez.'
		)
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
		expect(
			serveur.profils[COMPTE_TEST.id].image_gallery.map(f => f.id)
		).toEqual([envoye.id])
	})

	test('HEIC refusé avec un message clair, rien n’est envoyé', async ({
		page,
	}) => {
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
		expect(appels((await etat()).journal, 'POST', '/api/upload')).toHaveLength(
			0
		)
	})

	test('photo de profil remplacée : envoyée puis rattachée à la sauvegarde', async ({
		page,
	}) => {
		await ouvrirProfil(page)
		await page.getByTestId('update-resume-button').click()
		await page.getByTestId('file-main-upload').setInputFiles(await petitePng())
		await expect(page.getByTestId('photo-error')).toHaveCount(0)
		expect((await etat()).fichiers).toHaveLength(0)
		await page.getByTestId('save-button-resume').click()
		await expect(dialogue(page)).toBeHidden()
		const { fichiers, profils } = await etat()
		expect(fichiers).toHaveLength(1)
		expect(fichiers[0].mime).toBe('image/webp')
		expect(profils[COMPTE_TEST.id].main_picture.id).toBe(fichiers[0].id)
	})

	test('envoi refusé par l’API (413) : message, rien n’est rattaché', async ({
		page,
	}) => {
		await ouvrirProfil(page)
		await panne({ upload: 413 })
		await page.getByTestId('update-portefolio-button').click()
		await page
			.getByTestId('file-upload-portefolio')
			.setInputFiles(await petitePng())
		await page.getByTestId('add-button-portefolio').click()
		await page.getByTestId('save-button-portefolio').click()
		await expect(dialogue(page).getByTestId('save-error')).toHaveText(
			'La photo dépasse 10 Mo : choisis-en une plus légère.'
		)
		const { journal, profils } = await etat()
		expect(appels(journal, 'PATCH', '/api/me-makeup')).toHaveLength(0)
		expect(profils[COMPTE_TEST.id].image_gallery).toHaveLength(0)
	})
})

test.describe('UI-05 inscription et suppression', () => {
	async function inscrire(page, email = 'nouvelle@test.local') {
		await aller(page, '/auth/signup')
		await page.getByTestId('name').fill('nouvelle-compte')
		await page.getByTestId('email').fill(email)
		await page.getByTestId('password').fill('Test-1234')
		await page.getByTestId('submit').click()
		await expect(page).toHaveURL(/\/auth\/init-account/)
	}

	test('RG-07 API lente (2,5 s) : un seul profil créé, le nom attend sa création, « Bienvenue » après l’enregistrement', async ({
		page,
	}) => {
		await panne({ delaiPostMs: 2500 })
		await inscrire(page)
		await expect(
			page.getByText('Initialisation du compte en cours...')
		).toBeVisible()
		const prenom = page.getByTestId('first_name')
		await expect(prenom).toBeVisible({ timeout: 15_000 })
		const avant = await etat()
		const [creation] = appels(avant.journal, 'POST', '/api/me-makeup')
		expect(creation.fin).toBeDefined() // answered before the name step

		await prenom.fill('Al')
		await page.getByTestId('last_name').fill('Bo')
		await page.getByTestId('submit').click()
		// 2 letters pass the form, the API of today asks for 3: no « Bienvenue »
		await expect(page.getByTestId('save-error')).toHaveText(
			'Le prénom doit contenir au moins 3 caractères.'
		)
		await expect(page.getByText(/Bienvenue sur My.Makeup/)).toHaveCount(0)

		await prenom.fill('Prénomtest')
		await page.getByTestId('last_name').fill('Nomtest')
		await page.getByTestId('submit').click()
		await expect(page.getByText(/Bienvenue sur My.Makeup/)).toBeVisible()

		const apres = await etat()
		const compte = apres.comptes.find(c => c.email === 'nouvelle@test.local')
		expect(apres.profils[compte.id].first_name).toBe('Prénomtest')
		expect(apres.profils[compte.id].last_name).toBe('Nomtest')
		expect(appels(apres.journal, 'POST', '/api/me-makeup')).toHaveLength(1)
		for (const patch of appels(apres.journal, 'PATCH', '/api/me-makeup'))
			expect(patch.t).toBeGreaterThanOrEqual(creation.fin)
	})

	test('création du profil en échec : message et « Réessayer », jamais l’étape du nom', async ({
		page,
	}) => {
		await panne({ post: 500 })
		await inscrire(page, 'autre@test.local')
		await expect(page.getByTestId('init-account-error')).toBeVisible()
		await expect(page.getByTestId('first_name')).toHaveCount(0)
		await panne({ post: null })
		await page.getByTestId('init-account-retry').click()
		await expect(page.getByTestId('first_name')).toBeVisible()
	})

	test('suppression du compte : refusée → message et toujours connectée ; acceptée → déconnectée', async ({
		page,
	}) => {
		await ouvrirProfil(page)
		await panne({ suppression: 500 })
		await page.getByTestId('button-delete-account').click()
		await page.getByTestId('delete-account').click()
		await expect(page.getByTestId('delete-account-error')).toBeVisible()
		await expect(page).toHaveURL(/\/auth\/profil/)
		expect((await etat()).comptes).toHaveLength(1)

		await panne({ suppression: null })
		await page.getByTestId('delete-account').click()
		await expect(page).toHaveURL(/\/$/)
		const { comptes, profils, journal } = await etat()
		expect(comptes).toHaveLength(0)
		expect(profils[COMPTE_TEST.id]).toBeUndefined()
		expect(appels(journal, 'DELETE', '/api/me-makeup')).toHaveLength(2)
		const cookies = await page.context().cookies()
		expect(
			cookies.some(c => c.name.startsWith('next-auth.session-token'))
		).toBe(false)
	})
})

test.describe('A7 mot de passe oublié', () => {
	async function demander(page, email) {
		await aller(page, '/auth/mot-de-passe-oublie')
		await page.getByTestId('forgot-email-input').fill(email)
		await page.getByTestId('forgot-submit').click()
		const resultat = page.getByTestId('forgot-result')
		await expect(resultat).toBeVisible()
		return resultat.innerText()
	}

	test('S12 même réponse que l’adresse ait un compte ou non, et quand l’envoi échoue', async ({
		page,
	}) => {
		await aller(page, '/auth/signin')
		await page.getByTestId('forgot-password-link').click()
		await expect(page).toHaveURL(/\/auth\/mot-de-passe-oublie$/)

		const connue = await demander(page, COMPTE_TEST.email)
		const inconnue = await demander(page, 'personne@test.local')
		await panne({ fournisseurEmail: true })
		const fournisseurEnPanne = await demander(page, COMPTE_TEST.email)

		expect(connue).toBe(
			'Si un compte existe avec cette adresse, tu vas recevoir un email avec un lien pour choisir un nouveau mot de passe. Pense à regarder dans tes courriers indésirables.'
		)
		expect(inconnue).toBe(connue)
		expect(fournisseurEnPanne).toBe(connue)
		const { emails, journal } = await etat()
		expect(emails).toEqual([{ a: COMPTE_TEST.email, code: emails[0].code }])
		expect(appels(journal, 'POST', '/api/auth/forgot-password')).toHaveLength(3)
	})

	test('adresse mal formée : refusée par le formulaire, rien n’est envoyé', async ({
		page,
	}) => {
		await aller(page, '/auth/mot-de-passe-oublie')
		await page.getByTestId('forgot-email-input').fill('pas-une-adresse')
		await page.getByTestId('forgot-submit').click()
		await expect(page.getByText('Email invalide')).toBeVisible()
		expect(
			appels((await etat()).journal, 'POST', '/api/auth/forgot-password')
		).toHaveLength(0)
	})

	test('réinitialisation avec le code : il quitte l’URL, le nouveau mot de passe ouvre la session, l’ancien et le lien déjà servi sont refusés', async ({
		page,
	}) => {
		await demander(page, COMPTE_TEST.email)
		const [{ code }] = (await etat()).emails

		await aller(page, `/auth/reinitialiser?code=${code}`)
		// the code left the URL (audience measurement, history, Referer)
		await expect(page).toHaveURL(/\/auth\/reinitialiser$/)
		const cookie = (await page.context().cookies()).find(
			c => c.name === 'mm-reinit'
		)
		expect(cookie.path).toBe('/auth/reinitialiser')
		expect(cookie.httpOnly).toBe(true)

		await page.getByTestId('reset-password-input').fill('Nouveau-mdp-2')
		await page.getByTestId('reset-confirmation-input').fill('Nouveau-mdp-3')
		await page.getByTestId('reset-submit').click()
		await expect(page.getByTestId('reset-error')).toHaveText(
			'Les deux mots de passe ne sont pas identiques.'
		)
		expect(
			appels((await etat()).journal, 'POST', '/api/auth/reset-password')
		).toHaveLength(0)

		await page.getByTestId('reset-confirmation-input').fill('Nouveau-mdp-2')
		await page.getByTestId('reset-submit').click()
		await expect(page.getByTestId('reset-result')).toBeVisible()

		// the old password no longer opens a session, the new one does
		await aller(page, '/auth/signin')
		await page.getByTestId('email-input').fill(COMPTE_TEST.email)
		await page.getByTestId('password-input').fill(COMPTE_TEST.password)
		await page.getByTestId('email-signin').click()
		await expect(page.getByTestId('signin-error')).toHaveText(
			'Email ou mot de passe incorrect.'
		)
		await page.getByTestId('password-input').fill('Nouveau-mdp-2')
		await page.getByTestId('email-signin').click()
		await expect(page).toHaveURL(/\/auth\/profil/)

		// the link already used: no longer valid
		await aller(page, `/auth/reinitialiser?code=${code}`)
		await page.getByTestId('reset-password-input').fill('Encore-un-mdp-4')
		await page.getByTestId('reset-confirmation-input').fill('Encore-un-mdp-4')
		await page.getByTestId('reset-submit').click()
		await expect(page.getByTestId('reset-error')).toContainText(
			"Ce lien n'est plus valable"
		)
		await expect(page.getByTestId('reset-new-link')).toBeVisible()
	})

	test('page de réinitialisation sans code : lien pour en demander un', async ({
		page,
	}) => {
		await aller(page, '/auth/reinitialiser')
		await expect(page.getByTestId('reset-error')).toContainText(
			'Ce lien est incomplet'
		)
		await expect(page.getByTestId('reset-new-link')).toHaveAttribute(
			'href',
			'/auth/mot-de-passe-oublie'
		)
	})
})
