// The artist's space in a real browser against the fake Strapi
// (tests/regression/mock-api.mjs), launched by tests/regression/run.mjs:
// honest saves (UI-01, RG-01 to RG-03), editing with a finger and the
// keyboard (UI-02, UI-04, RG-05, RG-06), pictures (UI-03, RG-04), onboarding
// and deletion (UI-05, RG-07), the expired session (RG-08) and the
// forgotten password (A7, S12).
// Web-first waits only, no fixed timeout.
import { expect, test, devices } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { COMPTE_TEST } from './mock-api.mjs'
import {
	API,
	aller,
	appels,
	connecter,
	etat,
	inscrire,
	ouvrirProfil,
	panne,
	piloter,
	profilDeDepart,
	profilServeur,
	reinitialiserStrapi,
} from './outils-strapi.mjs'

const MO = 1024 * 1024

test.use({ testIdAttribute: 'data-cy' })

test.beforeEach(async () => {
	await reinitialiserStrapi()
})

// the open modal (its Dialog element has no size of its own)
const dialogue = page => page.getByTestId('modal-panel')

// fills fields of the open modal, { 'data-cy': value }, then checks them all
// back: no maxlength cuts a value, so the limits of the form are reached
async function remplir(page, valeurs) {
	for (const [cy, valeur] of Object.entries(valeurs))
		await dialogue(page).getByTestId(cy).fill(valeur)
	await valeursDeLaModale(page, valeurs)
}
async function valeursDeLaModale(page, valeurs) {
	for (const [cy, valeur] of Object.entries(valeurs))
		await expect(dialogue(page).getByTestId(cy), cy).toHaveValue(valeur)
}

// « Sauvegarder » of the open modal: closed once the API stored the save
async function sauver(page, cy) {
	await page.getByTestId(cy).click()
	await expect(dialogue(page)).toBeHidden()
}

const barreDeCompletion = page =>
	page.getByTestId('completion-pourcentage-profil')

// errors thrown in the page (a TypeError in a click handler…)
function erreursDeLaPage(page) {
	const erreurs = []
	page.on('pageerror', erreur => erreurs.push(erreur.message))
	return erreurs
}

// an offer with one option, as GET /api/me-makeup returns it
const OFFRE_AVEC_OPTION = {
	name: 'Offre A',
	price: '100',
	description: 'Description de l’offre A',
	options: [{ name: 'Option 1', price: '10', description: 'Option de test' }],
}
const EXPERIENCE = (company, date_start) => ({
	company,
	job_name: 'Maquilleuse',
	city: 'Annecy',
	date_start,
	date_end: null,
	description: 'Expérience de test',
})

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

async function petitePng(background = { r: 200, g: 120, b: 160 }) {
	const buffer = await sharp({
		create: { width: 1200, height: 1200, channels: 3, background },
	})
		.png()
		.toBuffer()
	return { name: 'portrait.png', mimeType: 'image/png', buffer }
}
const AUTRE_COULEUR = { r: 90, g: 160, b: 210 }

// the n-th of small WebP pictures of different colours, as a phone exports
// them: decoded by Chromium itself, not by the fakes of the unit tests
async function petiteWebp(n) {
	const buffer = await sharp({
		create: {
			width: 900,
			height: 600,
			channels: 3,
			background: { r: (40 + 20 * n) % 256, g: 120, b: (200 - 15 * n) % 256 },
		},
	})
		.webp()
		.toBuffer()
	const nom = `${String(n + 1).padStart(3, '0')}-portfolio.webp`
	return { name: nom, mimeType: 'image/webp', buffer }
}

// the profile picture shown in the resume modal: a blob once the picked
// picture is compressed (next/image leaves a blob unoptimized)
const apercuProfil = page => dialogue(page).getByAltText('photo de profil')

// picks a profile picture in the open resume modal and waits for its new
// preview: a save before that would leave it out
async function choisirPhotoProfil(page, photo) {
	const source = () =>
		apercuProfil(page).evaluateAll(
			images => images[0]?.getAttribute('src') ?? ''
		)
	const avant = await source()
	await page.getByTestId('file-main-upload').setInputFiles(photo)
	await expect
		.poll(async () => {
			const apres = await source()
			return apres.startsWith('blob:') && apres !== avant
		})
		.toBe(true)
	await expect(page.getByTestId('photo-error')).toHaveCount(0)
}

// picks a picture in the open portfolio modal and adds it to the gallery
async function ajouterAuPortfolio(page, photo) {
	await page.getByTestId('file-upload-portefolio').setInputFiles(photo)
	await expect(page.getByTestId('portfolio-preview')).toBeVisible()
	await page.getByTestId('add-button-portefolio').click()
}

// bodies of the PATCH /api/me-makeup sent by the page
function corpsDesPatchs(page) {
	const corps = []
	page.on('request', requete => {
		if (
			requete.method() === 'PATCH' &&
			new URL(requete.url()).pathname === '/api/me-makeup'
		)
			corps.push(requete.postDataJSON())
	})
	return corps
}

// stored pictures of the fake Strapi: n files sent before the API recorded
// the uploader (proprietaire null), or by that account
const fichiersStockes = (n, proprietaire = null) =>
	piloter('/__fichiers', { n, proprietaire })
const idsFichiers = async () => (await etat()).fichiers.map(f => f.id)
// the media sweep of the API, without its 24 h
const balayer = () => piloter('/__balayer', {})

// a save of her profile from another tab or device: straight to the fake
// Strapi, signed in on its own
async function sauverAilleurs(champs) {
	const { jwt } = await (
		await fetch(`${API}/api/auth/local`, {
			method: 'POST',
			body: JSON.stringify({
				identifier: COMPTE_TEST.email,
				password: COMPTE_TEST.password,
			}),
		})
	).json()
	const reponse = await fetch(`${API}/api/me-makeup`, {
		method: 'PATCH',
		headers: { authorization: `Bearer ${jwt}` },
		body: JSON.stringify(champs),
	})
	expect(reponse.status).toBe(200)
}

const MESSAGE_PHOTO_REFUSEE =
	"Choisis à nouveau ta photo : elle n'a pas été acceptée, et tes modifications n'ont pas été enregistrées."
const MESSAGE_PHOTO_RETIREE =
	"Une de tes photos a été retirée depuis un autre onglet ou appareil : tes modifications n'ont pas été enregistrées. Recharge la page puis réessaie."

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

	test('RG-02 prénom et nom : 1 lettre refusée dans la modale sans appel ; 2 lettres enregistrées, affichées et gardées au rechargement', async ({
		page,
	}) => {
		await ouvrirProfil(page)
		await page.getByTestId('update-resume-button').click()
		const prenom = page.getByTestId('first-name-input')
		const nom = page.getByTestId('last-name-input')

		// spaces do not count: « A » and « B » are one letter each
		await prenom.fill('A')
		await nom.fill(' B ')
		await page.getByTestId('save-button-resume').click()
		await expect(dialogue(page).getByTestId('error-first-name')).toHaveText(
			'Le prénom doit contenir au moins 2 caractères.'
		)
		await expect(dialogue(page).getByTestId('error-last-name')).toHaveText(
			'Le nom doit contenir au moins 2 caractères.'
		)
		expect(
			appels((await etat()).journal, 'PATCH', '/api/me-makeup')
		).toHaveLength(0)
		await expect(page.getByTestId('resume-name')).toHaveText('Testine Recette')

		// 2 letters: the rule of the API too (schema.json, minLength 2)
		await prenom.fill('Al')
		await nom.fill('Bo')
		await page.getByTestId('save-button-resume').click()
		await expect(dialogue(page)).toBeHidden()
		await expect(page.getByTestId('resume-name')).toHaveText('Al Bo')
		const profil = await profilServeur()
		expect(profil.first_name).toBe('Al')
		expect(profil.last_name).toBe('Bo')

		await aller(page, '/auth/profil')
		await expect(page.getByTestId('resume-name')).toHaveText('Al Bo')
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

	test('deux expériences : la 2e puis la 1re modifiées et sauvegardées sans recharger, chacune à sa place', async ({
		page,
	}) => {
		await profilDeDepart({
			experiences: [
				EXPERIENCE('Studio A', '2020-01-01'),
				EXPERIENCE('Studio B', '2022-01-01'),
			],
		})
		await ouvrirProfil(page)
		const modifier = async (index, avant, apres) => {
			await page.getByTestId('update-experience-button').click()
			await page.getByTestId(`experience-selected-${index}`).click()
			await expect(page.getByTestId('company-input')).toHaveValue(avant)
			await page.getByTestId('company-input').fill(apres)
			await page.getByTestId('add-experience-button').click()
			await page.getByTestId('save-button-experience').click()
			await expect(dialogue(page)).toBeHidden()
		}
		await modifier(1, 'Studio B', 'Studio B2')
		await modifier(0, 'Studio A', 'Studio A2')

		await expect(page.getByTestId('experience-company')).toHaveText([
			'Studio A2',
			'Studio B2',
		])
		const { experiences } = await profilServeur()
		expect(experiences.map(e => e.company)).toEqual(['Studio A2', 'Studio B2'])
		expect(experiences.map(e => e.date_start)).toEqual([
			'2020-01-01',
			'2022-01-01',
		])
	})

	test('offre avec options sauvegardée deux fois : options affichées, encore modifiables et conservées', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		await profilDeDepart({ service_offers: [OFFRE_AVEC_OPTION] })
		await ouvrirProfil(page)
		const optionDeLaPage = page.getByTestId('service-offer-name-0').first()
		await expect(optionDeLaPage).toHaveText('Option 1')

		// 1st save: one more offer, without options
		await page.getByTestId('update-service-offers-button').click()
		await page.getByTestId('name-service-offers-input').fill('Offre B')
		await page
			.getByTestId('description-service-offers-input')
			.fill('Description de l’offre B')
		await page.getByTestId('price-service-offers-input').fill('50')
		await page.getByTestId('add-service-offers-button').click()
		await page.getByTestId('save-button-service-offers').click()
		await expect(dialogue(page)).toBeHidden()
		// the PATCH answer has no options (populate one level): the page
		// keeps the ones it sent
		await expect(optionDeLaPage).toHaveText('Option 1')
		let { service_offers } = await profilServeur()
		expect(service_offers.map(o => o.name)).toEqual(['Offre A', 'Offre B'])
		expect(service_offers[0].options.map(o => o.name)).toEqual(['Option 1'])

		// 2nd save in the same session: the offer is edited again
		await page.getByTestId('update-service-offers-button').click()
		await page.getByTestId('edit-service-offers-button-0').click()
		await expect(
			page.getByTestId('name-service-offers-option-input-0')
		).toHaveValue('Option 1')
		await page.getByTestId('price-service-offers-input').fill('120')
		await page.getByTestId('add-service-offers-button').click()
		await page.getByTestId('save-button-service-offers').click()
		await expect(dialogue(page)).toBeHidden()

		await expect(optionDeLaPage).toHaveText('Option 1')
		;({ service_offers } = await profilServeur())
		expect(service_offers[0].price).toBe('120')
		expect(
			service_offers[0].options.map(({ name, price, description }) => ({
				name,
				price,
				description,
			}))
		).toEqual(OFFRE_AVEC_OPTION.options)
		expect(service_offers[1].options).toEqual([])

		await aller(page, '/auth/profil')
		await expect(optionDeLaPage).toHaveText('Option 1')
		expect(erreurs).toEqual([])
	})

	test('sauvegarde en cours : Échap, clic dehors et Fermer attendent la réponse ; l’échec s’affiche dans la modale, rouverte ensuite sans ce message', async ({
		page,
	}) => {
		await ouvrirProfil(page)
		await panne({ patch: 500, delaiPatchMs: 1500 })
		await page.getByTestId('update-location-button').click()
		await page.getByTestId('city-input').fill('Chambéry')
		await page.getByTestId('save-button-location').click()
		await expect(page.getByTestId('save-button-location')).toBeDisabled()

		await page.keyboard.press('Escape')
		await page.mouse.click(5, 5)
		await expect(dialogue(page).getByTestId('close-modal')).toBeDisabled()
		await expect(dialogue(page).getByTestId('save-error')).toHaveText(
			"Le service est momentanément indisponible : tes modifications n'ont pas été enregistrées. Réessaie dans quelques minutes."
		)
		await expect(page.getByTestId('city-input')).toHaveValue('Chambéry')

		// closed once the answer is in, then opened again: no old message
		await page.keyboard.press('Escape')
		await expect(dialogue(page)).toBeHidden()
		await panne({ patch: null, delaiPatchMs: 0 })
		await page.getByTestId('update-location-button').click()
		await expect(page.getByTestId('city-input')).toHaveValue('Annecy')
		await expect(dialogue(page).getByTestId('save-error')).toHaveCount(0)
		expect((await profilServeur()).city).toBe('Annecy')
	})
})

// The checks of the removed Cypress profile specs (profil.cy.js,
// profil-edge.cy.js, URG-11), against the fake Strapi: the limits and
// messages of each modal, what a save stores, and what the page, then its
// public view, show without a reload.
const SPECIALITE_65 =
	'Maquilleur professionnel et coiffeur professionnel pour le cinéma'

test.describe('complétion du profil', () => {
	test('8 % avec le seul nom, puis chaque modale enregistrée fait monter la barre jusqu’à 100 %, sans recharger', async ({
		page,
	}) => {
		test.slow()
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		await profilDeDepart({
			speciality: '',
			company_artist_name: null,
			city: null,
			description: null,
			skills: [],
			language: [],
			experiences: [],
			courses: [],
			service_offers: [],
			network: { instagram: '', email: '', phone: '' },
			main_picture: null,
			image_gallery: [],
		})
		await ouvrirProfil(page)
		// 1 criterion of 13: the name (first and last)
		await expect(barreDeCompletion(page)).toHaveText('8% de complétion')

		// one save of the resume: the picture and the 4 texts together
		await page.getByTestId('update-resume-button').click()
		await choisirPhotoProfil(page, await petitePng())
		await remplir(page, {
			'first-name-input': 'Alix',
			'last-name-input': 'Fictive',
			'speciality-input': SPECIALITE_65,
			'company-artist-input': 'My Makeup Artist',
		})
		await sauver(page, 'save-button-resume')
		let serveur = await etat()
		expect(appels(serveur.journal, 'POST', '/api/upload')).toHaveLength(1)
		const [photo] = serveur.fichiers
		expect(patchs).toEqual([
			{
				first_name: 'Alix',
				last_name: 'Fictive',
				speciality: SPECIALITE_65,
				company_artist_name: 'My Makeup Artist',
				available: true,
				main_picture: photo.id,
			},
		])
		expect(serveur.profils[COMPTE_TEST.id]).toMatchObject({
			first_name: 'Alix',
			last_name: 'Fictive',
			speciality: SPECIALITE_65,
			company_artist_name: 'My Makeup Artist',
			main_picture: { id: photo.id },
		})
		await expect(page.getByTestId('resume-name')).toHaveText('Alix Fictive')
		await expect(barreDeCompletion(page)).toHaveText('31% de complétion')

		// a description, however short
		await page.getByTestId('update-description-button').click()
		await remplir(page, {
			'description-input': 'Maquillage de mariée, de soirée et de tournage.',
		})
		await sauver(page, 'save-button-description')
		await expect(barreDeCompletion(page)).toHaveText('38% de complétion')

		// the place, the radius sent as typed (a string)
		await page.getByTestId('update-location-button').click()
		await remplir(page, {
			'city-input': 'Chambéry',
			'action-radius-input': '5',
		})
		await sauver(page, 'save-button-location')
		await expect(
			page.getByTestId('location-city-action-radius').first()
		).toHaveText('Chambéry et 5 km autour')
		await expect(barreDeCompletion(page)).toHaveText('46% de complétion')

		// a skill added with Enter
		await page.getByTestId('update-skills-button').click()
		await page.getByTestId('skills-input').fill('pieds')
		await page.getByTestId('skills-input').press('Enter')
		await sauver(page, 'save-button-skills')
		await expect(barreDeCompletion(page)).toHaveText('54% de complétion')

		// a course
		await page.getByTestId('update-courses-button').click()
		await remplir(page, {
			'diploma-input': 'Epsi',
			'school-input': 'epsi',
			'date-graduation-input': '2022-12-15',
			'course-description-input': 'informatique',
		})
		await page.getByTestId('add-course-button').click()
		await sauver(page, 'save-button-courses')
		await expect(barreDeCompletion(page)).toHaveText('62% de complétion')

		// an experience, its 6 fields
		await page.getByTestId('update-experience-button').click()
		await remplir(page, {
			'company-input': 'ForHives',
			'job-name-input': 'dev',
			'city-input': 'Nantes',
			'date-start-input': '2021-05-01',
			'date-end-input': '2023-05-01',
			'description-experience-input': 'Développement web',
		})
		await page.getByTestId('add-experience-button').click()
		await sauver(page, 'save-button-experience')
		await expect(barreDeCompletion(page)).toHaveText('69% de complétion')

		// a language added with Enter
		await page.getByTestId('update-languages-button').click()
		await page.getByTestId('language-input').fill('Anglais')
		await page.getByTestId('language-input').press('Enter')
		await sauver(page, 'save-button-languages')
		await expect(barreDeCompletion(page)).toHaveText('77% de complétion')

		// a contact channel
		await page.getByTestId('update-social-medias-button').click()
		await remplir(page, { 'email-input': 'alix@example.test' })
		await sauver(page, 'save-button-social-medias')
		await expect(barreDeCompletion(page)).toHaveText('85% de complétion')

		// an offer with one option
		await page.getByTestId('update-service-offers-button').click()
		await page.getByTestId('add-service-offers-option-button').click()
		await remplir(page, {
			'name-service-offers-input': 'Maquillage',
			'description-service-offers-input': 'Maquillage de soirée',
			'price-service-offers-input': '50€',
			'name-service-offers-option-input-0': 'Maquillage 1',
			'description-service-offers-option-input-0': 'Maquillage de soirée 1',
			'price-service-offers-option-input-0': '50€ 1',
		})
		await page.getByTestId('add-service-offers-button').click()
		await sauver(page, 'save-button-service-offers')
		// only the gallery is missing
		await expect(barreDeCompletion(page)).toHaveText('92% de complétion')

		// a picture in the portfolio: every criterion met
		await page.getByTestId('update-portefolio-button').click()
		await ajouterAuPortfolio(page, await petitePng(AUTRE_COULEUR))
		await sauver(page, 'save-button-portefolio')
		await expect(barreDeCompletion(page)).toHaveText('100% de complétion')

		// what the fake Strapi stored scores the same once reloaded
		await aller(page, '/auth/profil')
		await expect(barreDeCompletion(page)).toHaveText('100% de complétion')
		serveur = await etat()
		expect(appels(serveur.journal, 'PATCH', '/api/me-makeup')).toHaveLength(10)
		expect(erreurs).toEqual([])
	})
})

test.describe('UI-01 modales : limites, messages et valeurs enregistrées', () => {
	test('résumé : prénom et nom vides, puis 71 caractères dans les 4 champs, refusés dans la modale sans appel ; 70 caractères enregistrés', async ({
		page,
	}) => {
		const patchs = corpsDesPatchs(page)
		await ouvrirProfil(page)
		await page.getByTestId('update-resume-button').click()
		const erreur = cy => dialogue(page).getByTestId(cy)

		// empty names: the rule of 2 characters (UI-01)
		await remplir(page, { 'first-name-input': '', 'last-name-input': '' })
		await page.getByTestId('save-button-resume').click()
		await expect(erreur('error-first-name')).toHaveText(
			'Le prénom doit contenir au moins 2 caractères.'
		)
		await expect(erreur('error-last-name')).toHaveText(
			'Le nom doit contenir au moins 2 caractères.'
		)

		// 71 characters, typed in full
		const a71 = 'a'.repeat(71)
		await remplir(page, {
			'first-name-input': a71,
			'last-name-input': a71,
			'speciality-input': a71,
			'company-artist-input': a71,
		})
		await page.getByTestId('save-button-resume').click()
		await expect(erreur('error-first-name')).toHaveText(
			'Le prénom ne doit pas dépasser 70 caractères.'
		)
		await expect(erreur('error-last-name')).toHaveText(
			'Le nom ne doit pas dépasser 70 caractères.'
		)
		await expect(erreur('error-speciality')).toHaveText(
			'La spécialité ne doit pas dépasser 70 caractères.'
		)
		await expect(erreur('error-company-artist-name')).toHaveText(
			"Le nom de l'entreprise ne doit pas dépasser 70 caractères."
		)
		await expect(dialogue(page)).toBeVisible()
		await expect(page.getByTestId('resume-name')).toHaveText('Testine Recette')
		expect(patchs).toEqual([])
		expect(await profilServeur()).toMatchObject({
			first_name: 'Testine',
			last_name: 'Recette',
			speciality: 'Mariage',
			company_artist_name: 'Studio Test',
		})

		// 70: the limit of the API too (schema.json maxLength 70)
		const a70 = 'b'.repeat(70)
		await remplir(page, {
			'first-name-input': a70,
			'last-name-input': a70,
			'speciality-input': a70,
			'company-artist-input': a70,
		})
		await sauver(page, 'save-button-resume')
		expect(patchs).toHaveLength(1)
		expect(await profilServeur()).toMatchObject({
			first_name: a70,
			last_name: a70,
			speciality: a70,
			company_artist_name: a70,
		})
	})

	test('résumé : spécialité de 65 caractères et nom d’entreprise enregistrés, affichés en tête de l’espace puis dans sa vue publique', async ({
		page,
	}) => {
		expect(SPECIALITE_65).toHaveLength(65)
		const erreurs = erreursDeLaPage(page)
		await ouvrirProfil(page)
		await page.getByTestId('update-resume-button').click()
		await remplir(page, {
			'speciality-input': SPECIALITE_65,
			'company-artist-input': 'Studio Nantes',
		})
		await sauver(page, 'save-button-resume')
		expect(await profilServeur()).toMatchObject({
			speciality: SPECIALITE_65,
			company_artist_name: 'Studio Nantes',
		})
		for (const vue of ['édition', 'publique']) {
			if (vue === 'publique') {
				await page.getByTestId('profil-public-view').click()
				await expect(page).toHaveURL(/publicView=true/)
				await expect(page.getByTestId('update-resume-button')).toHaveCount(0)
			}
			await expect(page.getByTestId('resume-speciality'), vue).toHaveText(
				SPECIALITE_65
			)
			await expect(
				page.getByTestId('resume-company-artist-name'),
				vue
			).toHaveText('Studio Nantes')
		}
		expect(erreurs).toEqual([])
	})

	test('description : 2001 caractères refusés, puis vidée et enregistrée dans la même modale ; 2000 caractères enregistrés', async ({
		page,
	}) => {
		const patchs = corpsDesPatchs(page)
		await ouvrirProfil(page)
		await page.getByTestId('update-description-button').click()
		const erreur = dialogue(page).getByTestId('error-description')
		await remplir(page, { 'description-input': 'a'.repeat(2001) })
		await page.getByTestId('save-button-description').click()
		await expect(erreur).toHaveText(
			'La description ne doit pas dépasser 2000 caractères.'
		)
		expect(patchs).toEqual([])
		expect((await profilServeur()).description).toBe('Description initiale')

		// emptied in the same modal: the message does not block the save
		await remplir(page, { 'description-input': '' })
		await sauver(page, 'save-button-description')
		expect(patchs).toEqual([{ description: '' }])
		expect((await profilServeur()).description).toBe('')
		await expect(page.getByTestId('description')).toHaveCount(0)

		// 2000: the limit of the API too (schema.json maxLength 2000)
		await page.getByTestId('update-description-button').click()
		await expect(erreur).toHaveCount(0)
		await remplir(page, { 'description-input': 'b'.repeat(2000) })
		await sauver(page, 'save-button-description')
		expect((await profilServeur()).description).toBe('b'.repeat(2000))
		await expect(page.getByTestId('description')).toHaveText('b'.repeat(2000))
	})

	test('localisation : ville de 71 caractères et rayon de 11 chiffres refusés, puis vidés et enregistrés dans la même modale ; ni carte, ni « à & dans un rayon de km » en tête', async ({
		page,
	}) => {
		const patchs = corpsDesPatchs(page)
		await ouvrirProfil(page)
		await page.getByTestId('update-location-button').click()
		await remplir(page, {
			'city-input': 'a'.repeat(71),
			'action-radius-input': '1'.repeat(11),
		})
		await page.getByTestId('save-button-location').click()
		await expect(dialogue(page).getByTestId('error-city')).toHaveText(
			'La localisation ne doit pas dépasser 70 caractères.'
		)
		await expect(dialogue(page).getByTestId('error-action-radius')).toHaveText(
			"Le rayon d'action ne doit pas dépasser 10 caractères."
		)
		expect(patchs).toEqual([])
		expect(await profilServeur()).toMatchObject({
			city: 'Annecy',
			action_radius: 30,
		})

		// both optional: emptied in the same modal, then saved
		await remplir(page, { 'city-input': '', 'action-radius-input': '' })
		await sauver(page, 'save-button-location')
		expect(patchs).toEqual([{ city: '', action_radius: null }])
		expect(await profilServeur()).toMatchObject({
			city: '',
			action_radius: null,
		})
		for (const vue of ['édition', 'publique']) {
			if (vue === 'publique') {
				await page.getByTestId('profil-public-view').click()
				await expect(page).toHaveURL(/publicView=true/)
			}
			await expect(
				page.getByTestId('location-city-action-radius'),
				vue
			).toHaveCount(0)
			await expect(
				page.getByTestId('resume-city-action-radius'),
				vue
			).toHaveCount(0)
			await expect(page.locator('main'), vue).not.toContainText('rayon de km')
		}
	})

	test('localisation : Nantes et 5 km enregistrés, dans la phrase de la tête et la carte, aussi en vue publique', async ({
		page,
	}) => {
		const patchs = corpsDesPatchs(page)
		await ouvrirProfil(page)
		await page.getByTestId('update-location-button').click()
		await remplir(page, { 'city-input': 'Nantes', 'action-radius-input': '5' })
		await sauver(page, 'save-button-location')
		// the radius as typed: the API turns it into an integer
		expect(patchs).toEqual([{ city: 'Nantes', action_radius: '5' }])
		expect((await profilServeur()).city).toBe('Nantes')
		for (const vue of ['édition', 'publique']) {
			if (vue === 'publique') {
				await page.getByTestId('profil-public-view').click()
				await expect(page).toHaveURL(/publicView=true/)
			}
			await expect(
				page.getByTestId('resume-city-action-radius'),
				vue
			).toHaveText('peut se déplacer à Nantes & dans un rayon de 5km')
			await expect(
				page.getByTestId('location-city-action-radius').first(),
				vue
			).toHaveText('Nantes et 5 km autour')
		}
	})

	test('compétences : puce retirée, Entrée vide et « ; » seul refusés, la liste vide enregistrée ; 71 caractères refusés puis « pieds » et « yeux; » ajoutés, enregistrés et affichés', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		await ouvrirProfil(page)
		const champ = page.getByTestId('skills-input')
		const erreur = dialogue(page).getByTestId('error-skills')
		const puces = dialogue(page).getByTestId('skill-selected')
		const puce = nom =>
			dialogue(page).getByRole('button', {
				name: `Retirer ${nom}`,
				exact: true,
			})
		await page.getByTestId('update-skills-button').click()
		await puce('Mariée').click()
		await expect(puces).toHaveCount(0)

		// Enter on the empty field, then a blank skill closed by « ; »
		await champ.press('Enter')
		await expect(erreur).toHaveText('Une compétence est requise.')
		await champ.pressSequentially(' ;')
		await expect(erreur).toHaveText('Une compétence est requise.')
		await expect(puces).toHaveCount(0)
		// the message does not block the save of the list
		await sauver(page, 'save-button-skills')
		expect(patchs).toEqual([{ skills: [] }])
		expect((await profilServeur()).skills).toEqual([])
		await expect(page.getByTestId('skill')).toHaveCount(0)

		// 71 characters: not added with Enter, and the save is blocked
		await page.getByTestId('update-skills-button').click()
		await expect(erreur).toHaveCount(0)
		await remplir(page, { 'skills-input': 'a'.repeat(71) })
		await champ.press('Enter')
		const tropLongue = 'Les compétences ne doivent pas dépasser 70 caractères.'
		await expect(erreur).toHaveText(tropLongue)
		await expect(puces).toHaveCount(0)
		await page.getByTestId('save-button-skills').click()
		await expect(erreur).toHaveText(tropLongue)
		await expect(dialogue(page)).toBeVisible()
		expect(patchs).toHaveLength(1)

		// corrected in the same modal: the message goes, Enter adds it
		await champ.fill('pieds')
		await expect(erreur).toHaveCount(0)
		await champ.press('Enter')
		await expect(puce('pieds')).toBeVisible()
		await expect(champ).toHaveValue('')
		// the separator adds the skill typed before it, without itself
		await champ.pressSequentially('yeux;')
		await expect(puce('yeux')).toBeVisible()
		await expect(champ).toHaveValue('')
		// pasted with its separator, 71 characters are refused too
		await champ.fill(`${'a'.repeat(71)};`)
		await expect(erreur).toHaveText(tropLongue)
		await expect(puces).toHaveCount(2)
		await champ.fill('')
		await sauver(page, 'save-button-skills')
		expect(patchs[1]).toEqual({ skills: [{ name: 'pieds' }, { name: 'yeux' }] })
		expect((await profilServeur()).skills.map(s => s.name)).toEqual([
			'pieds',
			'yeux',
		])

		// shown on the page, in the public view, and once reloaded
		await expect(page.getByTestId('skill')).toHaveText(['pieds', 'yeux'])
		await page.getByTestId('profil-public-view').click()
		await expect(page).toHaveURL(/publicView=true/)
		await expect(page.getByTestId('skill')).toHaveText(['pieds', 'yeux'])
		await aller(page, '/auth/profil')
		await expect(page.getByTestId('skill')).toHaveText(['pieds', 'yeux'])
		expect(erreurs).toEqual([])
	})

	test('langues : Entrée vide, « ; » seul et 71 caractères (Entrée, « ; » tapé ou collé) refusés sans puce ni appel ; 70 caractères acceptés sans le « ; » ; « Français » retiré, « Anglais » et « Italien » ajoutés ; enregistrés et affichés', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		await ouvrirProfil(page)
		const champ = page.getByTestId('language-input')
		const erreur = dialogue(page).getByTestId('error-language')
		const puces = dialogue(page).getByTestId('language-selected')
		const puce = nom =>
			dialogue(page).getByRole('button', {
				name: `Retirer ${nom}`,
				exact: true,
			})
		await page.getByTestId('update-languages-button').click()
		await expect(puces).toHaveCount(1)

		await champ.press('Enter')
		await expect(erreur).toHaveText('La langue est requise.')
		await champ.pressSequentially(' ;')
		await expect(erreur).toHaveText('La langue est requise.')
		await expect(puces).toHaveCount(1)

		const tropLongue = 'La langue ne doit pas dépasser 70 caractères.'
		await remplir(page, { 'language-input': 'a'.repeat(71) })
		await champ.press('Enter')
		await expect(erreur).toHaveText(tropLongue)
		// the separator typed after it
		await champ.press(';')
		await expect(erreur).toHaveText(tropLongue)
		// pasted with its separator in one go, on a fresh field
		await champ.fill('')
		await champ.fill(`${'a'.repeat(71)};`)
		await expect(erreur).toHaveText(tropLongue)
		await expect(puces).toHaveCount(1)

		// 70 characters and the separator: added without it
		const a70 = 'a'.repeat(70)
		await champ.fill(a70)
		await expect(erreur).toHaveCount(0)
		await champ.press(';')
		await expect(puce(a70)).toBeVisible()
		await expect(puces).toHaveCount(2)
		expect(patchs).toEqual([])

		// the stored language removed, two added, with Enter and with « ; »
		await puce('Français').click()
		await expect(puces).toHaveCount(1)
		await champ.fill('Anglais')
		await champ.press('Enter')
		await expect(puce('Anglais')).toBeVisible()
		await expect(puces.nth(1)).toContainText('→ Anglais')
		await champ.pressSequentially('Italien;')
		await expect(puce('Italien')).toBeVisible()
		await sauver(page, 'save-button-languages')
		// the 70 characters, never the « ; » (language.name maxLength 70)
		const noms = [a70, 'Anglais', 'Italien']
		expect(patchs).toEqual([{ language: noms.map(name => ({ name })) }])
		expect((await profilServeur()).language.map(l => l.name)).toEqual(noms)

		// « → » then the name, each on its line
		const lignes = [/[^a]a{70}$/, /→\sAnglais$/, /→\sItalien$/]
		const langues = page.getByTestId('language').getByRole('listitem')
		await expect(langues).toHaveText(lignes)
		await page.getByTestId('profil-public-view').click()
		await expect(page).toHaveURL(/publicView=true/)
		await expect(langues).toHaveText(lignes)
		await aller(page, '/auth/profil')
		await expect(langues).toHaveText(lignes)
		expect(erreurs).toEqual([])
	})

	test('formations : retirée et enregistrée ; 4 messages sur le formulaire vide ; ajoutée, rouverte avec ses valeurs, modifiée sur place et affichée en vue publique', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		await profilDeDepart({
			courses: [
				{
					diploma: 'CAP',
					school: 'École A',
					date_graduation: '2015-06-30',
					course_description: 'Initiale',
				},
			],
		})
		await ouvrirProfil(page)
		await expect(page.getByTestId('course-diploma')).toHaveText(['CAP'])
		const formations = dialogue(page).getByTestId('course-delete-button')

		await page.getByTestId('update-courses-button').click()
		await dialogue(page)
			.getByRole('button', { name: 'Retirer la formation CAP' })
			.click()
		await expect(formations).toHaveCount(0)
		await sauver(page, 'save-button-courses')
		expect(patchs).toEqual([{ courses: [] }])
		expect((await profilServeur()).courses).toEqual([])
		await expect(page.getByTestId('course-diploma')).toHaveCount(0)

		// the empty form: the 4 required messages, nothing listed
		await page.getByTestId('update-courses-button').click()
		await page.getByTestId('add-course-button').click()
		const messages = {
			'error-diploma': 'Le nom du diplôme est requis.',
			'error-school': "Le nom de l'école est requis.",
			'error-date-graduation': "La date d'obtention du diplôme est requise.",
			'error-course-description': 'La description est requise.',
		}
		for (const [cy, message] of Object.entries(messages))
			await expect(dialogue(page).getByTestId(cy), cy).toHaveText(message)
		await expect(formations).toHaveCount(0)
		expect(patchs).toHaveLength(1)

		// filled in the same modal: the messages go, the course is listed
		const formation = {
			diploma: 'Epsi',
			school: 'epsi',
			date_graduation: '2022-10-10',
			course_description: 'informatique',
		}
		const champs = f => ({
			'diploma-input': f.diploma,
			'school-input': f.school,
			'date-graduation-input': f.date_graduation,
			'course-description-input': f.course_description,
		})
		await remplir(page, champs(formation))
		await page.getByTestId('add-course-button').click()
		for (const cy of Object.keys(messages))
			await expect(dialogue(page).getByTestId(cy), cy).toHaveCount(0)
		await expect(formations).toHaveCount(1)
		await sauver(page, 'save-button-courses')
		// no id sent: Strapi creates the components again
		expect(patchs[1]).toEqual({ courses: [formation] })
		expect((await profilServeur()).courses).toMatchObject([formation])

		// opened again without reloading: the form holds what was saved
		await page.getByTestId('update-courses-button').click()
		await page.getByTestId('course-edit-button-0').click()
		await valeursDeLaModale(page, champs(formation))
		await expect(page.getByTestId('add-course-button')).toHaveText(
			'Modifier la formation / diplôme'
		)
		const modifiee = {
			diploma: 'EpsiModified',
			school: 'epsiModified',
			date_graduation: '2022-10-10',
			course_description: 'informatiqueModified',
		}
		await remplir(page, champs(modifiee))
		await page.getByTestId('add-course-button').click()
		await expect(formations).toHaveCount(1)
		await sauver(page, 'save-button-courses')
		expect(patchs[2]).toEqual({ courses: [modifiee] })
		const { courses } = await profilServeur()
		expect(courses).toHaveLength(1)
		expect(courses[0]).toMatchObject(modifiee)

		for (const vue of ['édition', 'publique']) {
			if (vue === 'publique') {
				await page.getByTestId('profil-public-view').click()
				await expect(page).toHaveURL(/publicView=true/)
			}
			await expect(page.getByTestId('course-diploma'), vue).toHaveText([
				'EpsiModified',
			])
			await expect(page.getByTestId('course-school'), vue).toHaveText(
				'epsiModified'
			)
			await expect(page.getByTestId('course-date-graduation'), vue).toHaveText(
				'2022-10-10'
			)
			await expect(page.getByTestId('course-description'), vue).toHaveText(
				'informatiqueModified'
			)
		}
		expect(erreurs).toEqual([])
	})

	test('expériences : les deux retirées et enregistrées ; 4 messages sur le formulaire vide ; une ajoutée, rouverte avec ses 6 champs, modifiée sur place, lue en vue publique', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		await profilDeDepart({
			experiences: [
				EXPERIENCE('Studio A', '2020-01-01'),
				EXPERIENCE('Studio B', '2022-01-01'),
			],
		})
		await ouvrirProfil(page)
		const listees = dialogue(page).getByTestId('experience-selected')

		await page.getByTestId('update-experience-button').click()
		await expect(listees).toHaveCount(2)
		for (const studio of ['Studio A', 'Studio B'])
			await dialogue(page)
				.getByRole('button', { name: `Retirer l'expérience ${studio}` })
				.click()
		await expect(listees).toHaveCount(0)
		await sauver(page, 'save-button-experience')
		expect(patchs).toEqual([{ experiences: [] }])
		expect((await profilServeur()).experiences).toEqual([])
		await expect(page.getByTestId('experience-company')).toHaveCount(0)

		// the empty form: 4 required messages, nothing listed
		await page.getByTestId('update-experience-button').click()
		await page.getByTestId('add-experience-button').click()
		const messages = {
			'error-company': "Le nom de l'entreprise est requis.",
			'error-job-name': "Le nom de l'expérience est requis.",
			'error-city': 'La ville est requise.',
			'error-description-experience': 'La description est requise.',
		}
		for (const [cy, message] of Object.entries(messages))
			await expect(dialogue(page).getByTestId(cy), cy).toHaveText(message)
		await expect(listees).toHaveCount(0)

		// filled in the same modal: the messages go, it is listed
		const experience = {
			company: 'ForHives',
			job_name: 'dev',
			city: 'Nantes',
			date_start: '2021-05-05',
			date_end: '2021-05-05',
			description: 'informatique',
		}
		const champs = e => ({
			'company-input': e.company,
			'job-name-input': e.job_name,
			'city-input': e.city,
			'date-start-input': e.date_start,
			'date-end-input': e.date_end,
			'description-experience-input': e.description,
		})
		await remplir(page, champs(experience))
		await page.getByTestId('add-experience-button').click()
		for (const cy of Object.keys(messages))
			await expect(dialogue(page).getByTestId(cy), cy).toHaveCount(0)
		await expect(listees).toHaveCount(1)
		await expect(dialogue(page)).toContainText('ForHives')
		await sauver(page, 'save-button-experience')
		expect(patchs[1]).toEqual({ experiences: [experience] })

		// opened again without reloading: the edit button loads the 6 fields
		// of the experience added in this session
		await page.getByTestId('update-experience-button').click()
		await page.getByTestId('experience-selected-0').click()
		await valeursDeLaModale(page, champs(experience))
		await expect(page.getByTestId('add-experience-button')).toHaveText(
			'Modifier une expérience'
		)
		const modifiee = {
			company: 'ForHivesModified',
			job_name: 'devModified',
			city: 'NantesModified',
			date_start: '2021-05-05',
			date_end: '2023-05-05',
			description: 'informatiqueModified',
		}
		await remplir(page, champs(modifiee))
		await page.getByTestId('add-experience-button').click()
		await expect(listees).toHaveCount(1)
		await sauver(page, 'save-button-experience')
		expect(patchs[2]).toEqual({ experiences: [modifiee] })
		const { experiences } = await profilServeur()
		expect(experiences).toHaveLength(1)
		expect(experiences[0]).toMatchObject(modifiee)

		// the public view, without a reload
		await page.getByTestId('profil-public-view').click()
		await expect(page).toHaveURL(/publicView=true/)
		await expect(page.getByTestId('update-experience-button')).toHaveCount(0)
		await expect(page.getByTestId('experience-company')).toHaveText([
			'ForHivesModified',
		])
		await expect(page.getByTestId('experience-job-name')).toHaveText(
			'devModified'
		)
		await expect(page.getByTestId('experience-city')).toHaveText(
			'à NantesModified'
		)
		await expect(page.getByTestId('experience-date')).toHaveText(
			'mai 2021 - mai 2023'
		)
		await expect(page.getByTestId('experience-description')).toHaveText(
			'informatiqueModified'
		)
		expect(erreurs).toEqual([])
	})

	test('réseaux : « 0 » partout puis des valeurs trop longues refusés sans appel ; les 7 canaux enregistrés d’un appel, lus en vue publique ; tous vidés ensuite', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		await ouvrirProfil(page)
		const URLS = ['facebook', 'instagram', 'linkedin', 'website', 'youtube']
		const CANAUX = [...URLS, 'email', 'phone']
		const saisie = valeur =>
			Object.fromEntries(CANAUX.map(c => [`${c}-input`, valeur(c)]))
		const erreur = canal => dialogue(page).getByTestId(`error-${canal}`)
		await page.getByTestId('update-social-medias-button').click()

		// « 0 »: neither a URL, nor an email, nor a phone number
		await remplir(
			page,
			saisie(() => '0')
		)
		await page.getByTestId('save-button-social-medias').click()
		await expect(erreur('email')).toHaveText('Veuillez entrer un email valide.')
		for (const canal of URLS)
			await expect(erreur(canal), canal).toHaveText(
				'Veuillez entrer une URL valide (https://...).'
			)
		await expect(erreur('phone')).toHaveText(
			'Le numéro de téléphone est requis.'
		)
		expect(patchs).toEqual([])

		// valid, but over the limits of the API (200, phone 20)
		await remplir(
			page,
			saisie(c =>
				c === 'email'
					? `${'a'.repeat(200)}@a.fr`
					: c === 'phone'
						? `${'06'.repeat(10)}0`
						: `https://${'a'.repeat(200)}.fr`
			)
		)
		await page.getByTestId('save-button-social-medias').click()
		await expect(erreur('email')).toHaveText(
			"L'email ne doit pas dépasser 200 caractères."
		)
		for (const canal of URLS)
			await expect(erreur(canal), canal).toHaveText(
				"L'URL ne doit pas dépasser 200 caractères."
			)
		await expect(erreur('phone')).toHaveText(
			'Le numéro de téléphone ne doit pas dépasser 20 caractères.'
		)
		expect(patchs).toEqual([])

		// valid: the messages do not block the save, one call for the 7
		const reseau = {
			email: 'test@example.test',
			phone: '0606060606',
			facebook: 'https://facebook.example.test/studio',
			instagram: 'https://instagram.example.test/studio',
			linkedin: 'https://linkedin.example.test/in/studio',
			website: 'https://studio.example.test/',
			youtube: 'https://youtube.example.test/@studio',
		}
		await remplir(
			page,
			saisie(c => reseau[c])
		)
		await sauver(page, 'save-button-social-medias')
		expect(patchs).toEqual([{ network: reseau }])
		expect((await profilServeur()).network).toMatchObject(reseau)

		for (const vue of ['édition', 'publique']) {
			if (vue === 'publique') {
				await page.getByTestId('profil-public-view').click()
				await expect(page).toHaveURL(/publicView=true/)
			}
			for (const canal of CANAUX)
				await expect(page.getByTestId(canal), `${vue} ${canal}`).toHaveText(
					reseau[canal]
				)
			// data-cy is on the text, inside the link
			await expect(
				page.locator('a', { has: page.getByTestId('email') })
			).toHaveAttribute('href', 'mailto:test@example.test')
			await expect(
				page.locator('a', { has: page.getByTestId('phone') })
			).toHaveAttribute('href', 'tel:0606060606')
		}

		// every channel is optional: all emptied and saved
		await page.getByTestId('profil-edit-view').click()
		await page.getByTestId('update-social-medias-button').click()
		await remplir(
			page,
			saisie(() => '')
		)
		await sauver(page, 'save-button-social-medias')
		const vide = Object.fromEntries(CANAUX.map(c => [c, '']))
		expect(patchs[1]).toEqual({ network: vide })
		expect((await profilServeur()).network).toMatchObject(vide)
		for (const canal of CANAUX)
			await expect(page.getByTestId(canal), canal).toHaveCount(0)
		expect(erreurs).toEqual([])
	})

	test('prestations : retirée puis modale fermée, rien n’est enregistré ; retirée et sauvegardée, elle quitte le profil et la page', async ({
		page,
	}) => {
		const patchs = corpsDesPatchs(page)
		const OFFRE_B = {
			name: 'Offre B',
			price: '50',
			description: 'Description de l’offre B',
			options: [],
		}
		await profilDeDepart({ service_offers: [OFFRE_AVEC_OPTION, OFFRE_B] })
		await ouvrirProfil(page)
		const retirerA = dialogue(page).getByRole('button', {
			name: 'Retirer la prestation Offre A',
		})

		await page.getByTestId('update-service-offers-button').click()
		await retirerA.click()
		await expect(retirerA).toHaveCount(0)
		await page.keyboard.press('Escape')
		await expect(dialogue(page)).toBeHidden()
		expect(patchs).toEqual([])
		expect((await profilServeur()).service_offers.map(o => o.name)).toEqual([
			'Offre A',
			'Offre B',
		])

		await page.getByTestId('update-service-offers-button').click()
		await retirerA.click()
		await sauver(page, 'save-button-service-offers')
		expect(patchs).toEqual([{ service_offers: [OFFRE_B] }])
		expect((await profilServeur()).service_offers.map(o => o.name)).toEqual([
			'Offre B',
		])
		await expect(page.getByTestId('service-offer-name')).toHaveText(['Offre B'])
		await expect(page.getByText('Offre A', { exact: true })).toHaveCount(0)
	})

	test('prestation : nom, prix et description requis pour l’offre et ses 3 options ; 71 / 71 / 2001 caractères refusés ; 70 / 70 / 2000 acceptés et enregistrés tels quels', async ({
		page,
	}) => {
		const patchs = corpsDesPatchs(page)
		await ouvrirProfil(page)
		const erreur = cy => dialogue(page).getByTestId(cy)
		const listees = dialogue(page).getByTestId('delete-service-offers-button')
		// data-cy of the fields, and suffix of their messages, of the offer
		// ('') and of options 0 to 2
		const PARTIES = [
			['', ''],
			...[0, 1, 2].map(i => [`option-input-${i}`, `-${i}`]),
		]
		const champs = (nom, prix, description) =>
			Object.fromEntries(
				PARTIES.flatMap(([option], i) => {
					const cy = c => `${c}-service-offers-${option || 'input'}`
					return [
						[cy('name'), nom(i)],
						[cy('price'), prix(i)],
						[cy('description'), description(i)],
					]
				})
			)
		const messages = async (nom, prix, description) => {
			for (const [, suffixe] of PARTIES) {
				await expect(erreur(`error-name${suffixe}`)).toHaveText(nom)
				await expect(erreur(`error-price${suffixe}`)).toHaveText(prix)
				await expect(erreur(`error-description${suffixe}`)).toHaveText(
					description
				)
			}
		}

		await page.getByTestId('update-service-offers-button').click()
		for (let i = 0; i < 3; i++)
			await page.getByTestId('add-service-offers-option-button').click()
		await page.getByTestId('add-service-offers-button').click()
		await messages(
			'Le nom du service est requis.',
			'Le prix du service est requis.',
			'La description du service est requise.'
		)
		await expect(listees).toHaveCount(0)

		await remplir(
			page,
			champs(
				() => 'a'.repeat(71),
				() => 'b'.repeat(71),
				() => 'c'.repeat(2001)
			)
		)
		await page.getByTestId('add-service-offers-button').click()
		await messages(
			'Le nom du service ne doit pas dépasser 70 caractères.',
			'Le prix du service ne doit pas dépasser 70 caractères.',
			'La description ne doit pas dépasser 2000 caractères.'
		)
		await expect(listees).toHaveCount(0)
		expect(patchs).toEqual([])

		// at the limits, in the same modal: added, then saved as typed
		const nom = i => (i ? `Option ${i}` : 'Offre').padEnd(70, 'o')
		const prix = i => `${i + 1}0 €`.padEnd(70, '.')
		const description = i => `Détail ${i}`.padEnd(2000, '.')
		await remplir(page, champs(nom, prix, description))
		await page.getByTestId('add-service-offers-button').click()
		await expect(listees).toHaveCount(1)
		for (const [, suffixe] of PARTIES)
			for (const champ of ['name', 'price', 'description'])
				await expect(erreur(`error-${champ}${suffixe}`)).toHaveCount(0)
		await sauver(page, 'save-button-service-offers')
		const attendue = {
			name: nom(0),
			price: prix(0),
			description: description(0),
			options: [1, 2, 3].map(i => ({
				name: nom(i),
				price: prix(i),
				description: description(i),
			})),
		}
		expect(patchs).toEqual([{ service_offers: [attendue] }])
		const [stockee] = (await profilServeur()).service_offers
		expect(stockee).toMatchObject(attendue)
	})

	test('prestation de 3 options saisie, enregistrée, rouverte avec ses 12 champs, modifiée sur place, puis lue en vue publique, chaque option ouverte d’un clic', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		await ouvrirProfil(page)
		const offre = suffixe => ({
			name: `Maquillage${suffixe}`,
			description: `Maquillage de soirée${suffixe}`,
			price: `50€${suffixe}`,
			options: [1, 2, 3].map(n => ({
				name: `Maquillage ${n}${suffixe}`,
				description: `Maquillage de soirée ${n}${suffixe}`,
				price: `50€ ${n}${suffixe}`,
			})),
		})
		const champs = o => ({
			'name-service-offers-input': o.name,
			'description-service-offers-input': o.description,
			'price-service-offers-input': o.price,
			...Object.fromEntries(
				o.options.flatMap((option, i) => [
					[`name-service-offers-option-input-${i}`, option.name],
					[`description-service-offers-option-input-${i}`, option.description],
					[`price-service-offers-option-input-${i}`, option.price],
				])
			),
		})
		const stockees = async () =>
			(await profilServeur()).service_offers.map(o => ({
				name: o.name,
				description: o.description,
				price: o.price,
				options: o.options.map(({ name, description, price }) => ({
					name,
					description,
					price,
				})),
			}))

		await page.getByTestId('update-service-offers-button').click()
		for (let i = 0; i < 3; i++)
			await page.getByTestId('add-service-offers-option-button').click()
		await remplir(page, champs(offre('')))
		await page.getByTestId('add-service-offers-button').click()
		await sauver(page, 'save-button-service-offers')
		expect(await stockees()).toEqual([offre('')])

		// opened again: the edit button loads the offer and its 3 options
		await page.getByTestId('update-service-offers-button').click()
		await page.getByTestId('edit-service-offers-button-0').click()
		await valeursDeLaModale(page, champs(offre('')))
		await expect(page.getByTestId('add-service-offers-button')).toHaveText(
			'Modifier une prestation'
		)
		await remplir(page, champs(offre(' Modified')))
		await page.getByTestId('add-service-offers-button').click()
		await sauver(page, 'save-button-service-offers')
		// edited in place, never added a second time
		expect(await stockees()).toEqual([offre(' Modified')])

		// the public view, then the same read again from the fake Strapi: an
		// option shows its description and price once its chevron is clicked
		const attendue = offre(' Modified')
		for (const chargement of ['bascule', 'rechargement']) {
			if (chargement === 'bascule') {
				await page.getByTestId('profil-public-view').click()
				await expect(page).toHaveURL(/publicView=true/)
			} else await aller(page, '/auth/profil?publicView=true')
			await expect(page.getByTestId('service-offer-name')).toHaveText(
				attendue.name
			)
			await expect(page.getByTestId('service-offer-description')).toHaveText(
				attendue.description
			)
			await expect(page.getByTestId('service-offer-price')).toHaveText(
				attendue.price
			)
			for (const [i, option] of attendue.options.entries()) {
				const description = page.getByTestId(`service-offer-description-${i}`)
				const prix = page.getByTestId(`service-offer-price-${i}`)
				await expect(page.getByTestId(`service-offer-name-${i}`)).toHaveText(
					option.name
				)
				await expect(description, chargement).toBeHidden()
				await expect(prix, chargement).toBeHidden()
				await page.getByTestId(`service-offer-button-${i}`).click()
				await expect(description, chargement).toBeVisible()
				await expect(description).toHaveText(option.description)
				await expect(prix, chargement).toBeVisible()
				await expect(prix).toHaveText(option.price)
			}
		}
		expect(erreurs).toEqual([])
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

	test('toutes les cartes ont un bouton « Modifier » visible de 44 px, avec un anneau au focus clavier', async ({
		page,
	}) => {
		await ouvrirProfil(page)
		// a key pressed first: a focus() then counts as a keyboard focus
		await page.keyboard.press('Shift')
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
			const ombre = () => bouton.evaluate(b => getComputedStyle(b).boxShadow)
			// no ring before the focus, an indigo-600 one with it
			expect(await ombre(), cy).toBe('none')
			await bouton.focus()
			expect(await bouton.evaluate(b => b.matches(':focus-visible')), cy).toBe(
				true
			)
			expect(await ombre(), cy).toContain('rgb(79, 70, 229)')
		}
	})

	test('interrupteur de disponibilité : 44 px, nommé par son label, au clavier', async ({
		page,
	}) => {
		await ouvrirProfil(page)
		await page.getByTestId('update-resume-button').click()
		const interrupteur = dialogue(page).getByRole('switch', {
			name: 'Disponibilité',
		})
		// measured once the opening (scale 95 % → 100 %) is over
		const cote = async () => {
			const { width, height } = await interrupteur.boundingBox()
			return Math.min(width, height)
		}
		await expect.poll(cote).toBeGreaterThanOrEqual(44)
		await expect(interrupteur).toHaveAttribute('aria-checked', 'true')
		await interrupteur.focus()
		await page.keyboard.press('Space')
		await expect(interrupteur).toHaveAttribute('aria-checked', 'false')
	})

	test('10 modales : chaque champ a un label relié, aucun id en double, chaque commande fait 44 px', async ({
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
			await page.getByTestId(cy).click()
			await expect(dialogue(page)).toBeVisible()
			// translucent backdrop behind every modal (UI-04)
			await expect(page.getByTestId('modal-backdrop'), cy).toHaveCSS(
				'background-color',
				'rgba(107, 114, 128, 0.75)'
			)
			if (cy === 'update-service-offers-button') {
				// the fields of an option only exist once one is added
				await page.getByTestId('add-service-offers-option-button').click()
				await page.getByTestId('add-service-offers-option-button').click()
			}
			// measured once the opening (scale 95 % → 100 %) is over
			await expect
				.poll(() => dialogue(page).evaluate(p => getComputedStyle(p).transform))
				.toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/)
			const bilan = await dialogue(page).evaluate(panneau => {
				const nom = e =>
					e.dataset.cy ||
					e.id ||
					e.getAttribute('aria-label') ||
					e.outerHTML.slice(0, 120)
				const champs = [
					...panneau.querySelectorAll(
						'input:not([type=hidden]), textarea, select, [role=switch]'
					),
				]
				const ids = [...panneau.querySelectorAll('[id]')].map(e => e.id)
				const cibles = [...panneau.querySelectorAll('label[for]')].map(
					l => l.htmlFor
				)
				return {
					sansLabel: champs
						.filter(
							c =>
								!c.labels?.length &&
								!c.getAttribute('aria-label') &&
								!c.getAttribute('aria-labelledby')
						)
						.map(nom),
					idsEnDouble: ids.filter((id, i) => ids.indexOf(id) !== i),
					labelsSansChamp: cibles.filter(
						id => !panneau.querySelector(`[id="${CSS.escape(id)}"]`)
					),
					labelsPartages: cibles.filter((id, i) => cibles.indexOf(id) !== i),
					// buttons, switches, tabs and links shown, under 44 px (the
					// focus guards of Headless UI are aria-hidden, 1 px)
					ciblesPetites: [
						...panneau.querySelectorAll(
							'button, [role=switch], [role=tab], a[href]'
						),
					]
						.filter(e => {
							if (e.closest('[aria-hidden="true"]')) return false
							const { width, height } = e.getBoundingClientRect()
							return width > 0 && (width < 44 || height < 44)
						})
						.map(nom),
				}
			})
			expect(bilan, cy).toEqual({
				sansLabel: [],
				idsEnDouble: [],
				labelsSansChamp: [],
				labelsPartages: [],
				ciblesPetites: [],
			})
			await page.keyboard.press('Escape')
			await expect(dialogue(page)).toBeHidden()
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

	// no edit control anywhere: the top of the page and the cards
	async function vuePubliqueSeule(page) {
		await expect(page.getByTestId('resume-name')).toHaveText('Testine Recette')
		await expect(page.getByTestId('profil-edit-view')).toBeVisible()
		for (const cy of [
			'update-resume-button',
			'update-picture-button',
			'update-description-button',
			'profil-public-view',
		])
			await expect(page.getByTestId(cy), cy).toHaveCount(0)
	}

	test('UI-02 ?publicView=true chargé directement, puis rechargé : vue publique seule ; « Modifier mon profil » rend la vue d’édition', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		page.on('console', m => {
			if (m.type() === 'error' && !/Failed to load resource/.test(m.text()))
				erreurs.push(m.text())
		})
		expect(await connecter(page)).toBe(true)
		// the server already renders the public view: same page once hydrated
		const html = await (
			await page.context().request.get('/auth/profil?publicView=true')
		).text()
		expect(html).toContain('data-cy="profil-edit-view"')
		expect(html).not.toContain('data-cy="update-resume-button"')
		expect(html).not.toContain('data-cy="update-picture-button"')
		// aller() waits for the hydration: the old effects had run by then
		await aller(page, '/auth/profil?publicView=true')
		await vuePubliqueSeule(page)
		const session = page.waitForResponse(r =>
			r.url().endsWith('/api/auth/session')
		)
		await page.reload()
		await session
		await vuePubliqueSeule(page)

		// « Modifier mon profil »: every edit control is back
		await page.getByTestId('profil-edit-view').click()
		await expect(page).not.toHaveURL(/publicView/)
		await expect(page.getByTestId('update-resume-button')).toBeVisible()
		await expect(page.getByTestId('update-picture-button')).toHaveCount(1)
		await expect(page.getByTestId('profil-edit-view')).toHaveCount(0)
		await expect(page.getByTestId('update-description-button')).toBeVisible()
		await expect(page.getByTestId('profil-public-view')).toBeVisible()
		expect(erreurs).toEqual([])
	})

	test('UI-02 la bascule de vue n’ajoute aucune entrée d’historique : modale ouverte puis retour du navigateur, on quitte l’espace sans modale bloquée', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		expect(await connecter(page)).toBe(true)
		await aller(page, '/')
		// to her space from the menu (navigation côté client)
		await page.getByRole('link', { name: 'Profil', exact: true }).click()
		await expect(page.getByTestId('resume-name')).toHaveText('Testine Recette')
		const entrees = await page.evaluate(() => history.length)
		await page.getByTestId('profil-public-view').click()
		await expect(page).toHaveURL(/publicView=true/)
		await vuePubliqueSeule(page)
		await page.getByTestId('profil-edit-view').click()
		await expect(page).not.toHaveURL(/publicView/)
		expect(await page.evaluate(() => history.length)).toBe(entrees)

		// Back (the usual way to dismiss a modal on Android) leaves her space
		await page.getByTestId('update-description-button').click()
		await expect(page.getByTestId('description-input')).toBeVisible()
		await page.goBack()
		await expect(page).toHaveURL(url => url.pathname === '/')
		await expect(dialogue(page)).toHaveCount(0)
		await expect(page.getByTestId('description-input')).toHaveCount(0)

		// Forward: her space in the edit view, each modal opens and closes
		await page.goForward()
		await expect(page).toHaveURL(
			url => url.pathname === '/auth/profil' && url.search === ''
		)
		await expect(dialogue(page)).toBeHidden()
		await page.getByTestId('update-description-button').click()
		await expect(page.getByTestId('description-input')).toBeVisible()
		await page.keyboard.press('Escape')
		await expect(page.getByTestId('description-input')).toBeHidden()
		await page.getByTestId('update-resume-button').click()
		await expect(dialogue(page)).toBeVisible()
		await dialogue(page).getByTestId('close-modal').click()
		await expect(dialogue(page)).toBeHidden()
		expect(erreurs).toEqual([])
	})
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

	test('photo de profil remplacée : la nouvelle est envoyée et rattachée à la sauvegarde, l’ancienne est supprimée', async ({
		page,
	}) => {
		// her current picture, sent before the API recorded the uploader
		const [ancienne] = await fichiersStockes(1)
		await profilDeDepart({ main_picture: ancienne.id })
		await ouvrirProfil(page)
		await page.getByTestId('update-resume-button').click()
		await expect(page.getByTestId('file-main-upload')).toHaveAttribute(
			'accept',
			'image/jpeg,image/png,image/webp'
		)
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
		await expect(dialogue(page).getByTestId('save-error')).toHaveText(
			MESSAGE_PHOTO_REFUSEE
		)
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
		expect(patchs.map(corps => corps.main_picture)).toEqual([
			refusee.id,
			undefined,
			nouvelle.id,
		])
		// a file without uploader is never swept (API #385)
		await balayer()
		expect(await idsFichiers()).toEqual([refusee.id, nouvelle.id])
	})

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
		await expect(dialogue(page).getByTestId('save-error')).toHaveText(
			MESSAGE_PHOTO_REFUSEE
		)
		await expect(dialogue(page).getByTestId('portfolio-slide')).toHaveCount(1)
		await expect(page.getByTestId('portfolio-pending')).toHaveCount(0)
		const [, refusee] = (await etat()).fichiers
		expect(
			(await profilServeur()).image_gallery.map(photo => photo.id)
		).toEqual([enregistree.id])

		// added again: uploaded again, saved after the stored picture
		await panne({ uploadSansProprietaire: false })
		await ajouterAuPortfolio(page, await petitePng())
		await page.getByTestId('save-button-portefolio').click()
		await expect(dialogue(page)).toBeHidden()
		const { fichiers, profils } = await etat()
		const nouvelle = fichiers.find(
			f => ![enregistree.id, refusee.id].includes(f.id)
		)
		expect(
			profils[COMPTE_TEST.id].image_gallery.map(photo => photo.id)
		).toEqual([enregistree.id, nouvelle.id])
		expect(patchs.map(corps => corps.image_gallery)).toEqual([
			[enregistree.id, refusee.id],
			[enregistree.id, nouvelle.id],
		])
	})

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
		await expect(dialogue(page).getByTestId('save-error')).toHaveText(
			MESSAGE_PHOTO_RETIREE
		)
		const [, nouvelle] = (await etat()).fichiers
		expect(patchs).toEqual([{ image_gallery: [x.id, y.id, nouvelle.id] }])
		// X leaves the gallery; Y and the picture sent, accepted, stay
		await expect(dialogue(page).getByTestId('portfolio-slide')).toHaveCount(2)
		await expect(page.getByTestId('portfolio-pending')).toHaveCount(0)
		expect(
			(await profilServeur()).image_gallery.map(photo => photo.id)
		).toEqual([y.id])

		// saved again without a reload: X is never sent again, the picture
		// is not uploaded again
		await page.getByTestId('save-button-portefolio').click()
		await expect(dialogue(page)).toBeHidden()
		expect(patchs[1]).toEqual({ image_gallery: [y.id, nouvelle.id] })
		const { journal, profils } = await etat()
		expect(appels(journal, 'POST', '/api/upload')).toHaveLength(1)
		expect(
			profils[COMPTE_TEST.id].image_gallery.map(photo => photo.id)
		).toEqual([y.id, nouvelle.id])
	})

	test('photo retirée du portfolio et sauvegardée : son fichier est supprimé, les autres restent', async ({
		page,
	}) => {
		const [premiere, seconde] = await fichiersStockes(2)
		await profilDeDepart({ image_gallery: [premiere.id, seconde.id] })
		await ouvrirProfil(page)
		await page.getByTestId('update-portefolio-button').click()
		await expect(dialogue(page).getByTestId('portfolio-slide')).toHaveCount(2)
		// closed without saving: nothing is deleted
		await dialogue(page)
			.getByRole('button', { name: 'Retirer la photo 1' })
			.click()
		await expect(dialogue(page).getByTestId('portfolio-slide')).toHaveCount(1)
		await page.keyboard.press('Escape')
		await expect(dialogue(page)).toBeHidden()
		expect(await idsFichiers()).toEqual([premiere.id, seconde.id])

		await page.getByTestId('update-portefolio-button').click()
		await dialogue(page)
			.getByRole('button', { name: 'Retirer la photo 1' })
			.click()
		await page.getByTestId('save-button-portefolio').click()
		await expect(dialogue(page)).toBeHidden()
		expect(
			(await profilServeur()).image_gallery.map(photo => photo.id)
		).toEqual([seconde.id])
		expect(await idsFichiers()).toEqual([seconde.id])
		expect((await fetch(premiere.url)).status).toBe(404)
	})

	test('photo de profil de plus de 25 Mo : refusée dans la modale, son message et son toast ; la sauvegarde n’envoie aucun fichier', async ({
		page,
	}) => {
		const patchs = corpsDesPatchs(page)
		await ouvrirProfil(page)
		await page.getByTestId('update-resume-button').click()
		// 25 MB and 1 byte, read as a JPEG: refused on its size, not its type
		await page.getByTestId('file-main-upload').setInputFiles({
			name: 'enorme.jpg',
			mimeType: 'image/jpeg',
			buffer: Buffer.concat([
				Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
				Buffer.alloc(25 * MO - 3),
			]),
		})
		const message =
			'Cette photo pèse plus de 25 Mo : choisis-en une plus légère.'
		await expect(page.getByTestId('photo-error')).toHaveText(message)
		await expect(page.locator('#photo-refusee')).toContainText(message)

		await sauver(page, 'save-button-resume')
		const { journal, fichiers, profils } = await etat()
		expect(appels(journal, 'POST', '/api/upload')).toHaveLength(0)
		expect(fichiers).toEqual([])
		expect(patchs).toHaveLength(1)
		expect(patchs[0]).not.toHaveProperty('main_picture')
		expect(profils[COMPTE_TEST.id].main_picture).toBeNull()
	})

	test('portfolio : 10 photos WebP ajoutées, la 11e refusée ; les 10 envoyées à la sauvegarde, dans l’ordre ; toutes retirées ensuite, la galerie vide enregistrée et leurs fichiers supprimés', async ({
		page,
	}) => {
		test.slow()
		const patchs = corpsDesPatchs(page)
		await ouvrirProfil(page)
		await page.getByTestId('update-portefolio-button').click()
		const vignettes = dialogue(page).getByTestId('portfolio-slide')
		const photos = await Promise.all(
			Array.from({ length: 11 }, (_, n) => petiteWebp(n))
		)
		for (const [n, photo] of photos.slice(0, 10).entries()) {
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
		expect(appels((await etat()).journal, 'POST', '/api/upload')).toHaveLength(
			0
		)

		await sauver(page, 'save-button-portefolio')
		const { journal, fichiers, profils } = await etat()
		expect(appels(journal, 'POST', '/api/upload')).toHaveLength(10)
		expect(fichiers.map(f => f.mime)).toEqual(Array(10).fill('image/webp'))
		// uploaded in the order added, saved in that order
		expect(fichiers.map(f => f.name)).toEqual(
			photos.slice(0, 10).map(p => p.name)
		)
		const ids = fichiers.map(f => f.id)
		expect(profils[COMPTE_TEST.id].image_gallery.map(f => f.id)).toEqual(ids)
		expect(patchs).toEqual([{ image_gallery: ids }])

		// every picture removed, the empty gallery saved
		await page.getByTestId('update-portefolio-button').click()
		await expect(vignettes).toHaveCount(10)
		for (let n = 10; n > 0; n--) {
			await dialogue(page)
				.getByRole('button', { name: 'Retirer la photo 1', exact: true })
				.click()
			await expect(vignettes).toHaveCount(n - 1)
		}
		await sauver(page, 'save-button-portefolio')
		expect(patchs[1]).toEqual({ image_gallery: [] })
		expect((await profilServeur()).image_gallery).toEqual([])
		expect(await idsFichiers()).toEqual([])
		for (const f of fichiers) expect((await fetch(f.url)).status).toBe(404)

		await aller(page, '/auth/profil')
		await page.getByTestId('update-portefolio-button').click()
		await expect(dialogue(page)).toBeVisible()
		await expect(vignettes).toHaveCount(0)
	})

	test('portfolio de 10 photos enregistrées : la 11e refusée, rien n’est envoyé ; une photo retirée, celle choisie s’ajoute sans la choisir à nouveau et remplace l’autre à la sauvegarde', async ({
		page,
	}) => {
		const stockees = await fichiersStockes(10)
		await profilDeDepart({ image_gallery: stockees.map(f => f.id) })
		await ouvrirProfil(page)
		await page.getByTestId('update-portefolio-button').click()
		const vignettes = dialogue(page).getByTestId('portfolio-slide')
		await expect(vignettes).toHaveCount(10)

		await page
			.getByTestId('file-upload-portefolio')
			.setInputFiles(await petiteWebp(0))
		await expect(page.getByTestId('portfolio-preview')).toBeVisible()
		await page.getByTestId('add-button-portefolio').click()
		await expect(page.getByTestId('photo-error')).toHaveText(
			'Ton portfolio contient déjà 10 photos : retires-en une pour en ajouter une autre.'
		)
		await expect(vignettes).toHaveCount(10)
		await expect(page.getByTestId('portfolio-pending')).toHaveCount(0)
		// the picked picture is kept for later
		await expect(page.getByTestId('add-button-portefolio')).toBeEnabled()
		expect(appels((await etat()).journal, 'POST', '/api/upload')).toHaveLength(
			0
		)

		await dialogue(page)
			.getByRole('button', { name: 'Retirer la photo 1', exact: true })
			.click()
		await expect(vignettes).toHaveCount(9)
		await page.getByTestId('add-button-portefolio').click()
		await expect(vignettes).toHaveCount(10)
		await expect(page.getByTestId('portfolio-pending')).toHaveText(
			'1 photo sera envoyée quand vous sauvegarderez.'
		)

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
	// « Comment as-tu connu My Makeup ? », in the order shown
	const ORIGINES = [
		['instagram', 'Instagram'],
		['google', 'Recherche Google'],
		['bouche-a-oreille', 'Bouche-à-oreille'],
		['ecole', 'École de maquillage'],
		['autre', 'Autre'],
	]

	// RG-07, at 1440 px and on a phone. `appuyer` clicks, or taps on a phone.
	async function rg07(page, { appuyer = cible => cible.click() } = {}) {
		const erreurs = erreursDeLaPage(page)
		// bodies the browser sends to the API for the profile
		const corps = []
		// every request of the page to the fake Strapi or to an /api route of
		// the app, any method (the Umami sends go to /u/api/send)
		const versLApi = []
		page.on('request', requete => {
			const url = new URL(requete.url())
			if (
				url.pathname === '/api/me-makeup' &&
				['POST', 'PATCH'].includes(requete.method())
			)
				corps.push([requete.method(), requete.postDataJSON()])
			if (
				url.origin === new URL(API).origin ||
				url.pathname.startsWith('/api/')
			)
				versLApi.push([requete.url(), requete.postData() ?? ''])
		})

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

		// the optional question: 5 answers, none chosen, 44 px targets
		const question = page.getByRole('group', {
			name: /Comment as-tu connu My.Makeup/,
		})
		await expect(question).toBeVisible()
		for (const [valeur, libelle] of ORIGINES) {
			const choix = question.getByLabel(libelle, { exact: true })
			await expect(choix).toHaveAttribute(
				'data-cy',
				`onboarding-source-${valeur}`
			)
			await expect(choix).not.toBeChecked()
		}
		expect(await question.getByRole('radio').count()).toBe(ORIGINES.length)
		for (const libelle of await question.locator('label').all())
			expect((await libelle.boundingBox()).height).toBeGreaterThanOrEqual(44)
		// nothing wider than the screen
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth + 1
			)
		).toBe(true)

		// 1 letter: refused by the form, nothing sent
		await prenom.fill('A')
		await page.getByTestId('last_name').fill('Bo')
		await appuyer(page.getByTestId('submit'))
		await expect(page.getByTestId('error-first-name')).toHaveText(
			'Ton prénom doit contenir au moins 2 caractères.'
		)
		expect(
			appels((await etat()).journal, 'PATCH', '/api/me-makeup')
		).toHaveLength(0)

		// an answer to the question, on its label; it can be taken back
		await appuyer(question.getByText('Instagram', { exact: true }))
		await expect(page.getByTestId('onboarding-source-instagram')).toBeChecked()
		const effacer = page.getByTestId('onboarding-source-effacer')
		await expect(effacer).toHaveText('Effacer ma réponse')
		expect((await effacer.boundingBox()).height).toBeGreaterThanOrEqual(44)

		// the save fails: its message, no « Bienvenue »
		await panne({ patch: 500 })
		await prenom.fill('Al')
		await appuyer(page.getByTestId('submit'))
		await expect(page.getByTestId('save-error')).toHaveText(
			"Le service est momentanément indisponible : tes modifications n'ont pas été enregistrées. Réessaie dans quelques minutes."
		)
		await expect(page.getByText(/Bienvenue sur My.Makeup/)).toHaveCount(0)

		// 2 letters stored, then « Bienvenue »
		await panne({ patch: null })
		await appuyer(page.getByTestId('submit'))
		await expect(page.getByText(/Bienvenue sur My.Makeup/)).toBeVisible()

		const apres = await etat()
		const compte = apres.comptes.find(c => c.email === 'nouvelle@test.local')
		expect(apres.profils[compte.id].first_name).toBe('Al')
		expect(apres.profils[compte.id].last_name).toBe('Bo')
		expect(appels(apres.journal, 'POST', '/api/me-makeup')).toHaveLength(1)
		const patchs = appels(apres.journal, 'PATCH', '/api/me-makeup')
		expect(patchs).toHaveLength(2)
		for (const patch of patchs) {
			expect(patch.t).toBeGreaterThanOrEqual(creation.fin)
			// the answer is never stored (UI-05)
			expect(patch.cles).not.toContain('source')
			expect(patch.cles).not.toContain('onboarding_source')
		}
		expect(corps.map(([methode]) => methode)).toEqual([
			'POST',
			'PATCH',
			'PATCH',
		])
		for (const [methode, envoye] of corps) {
			expect(Object.keys(envoye ?? {}), methode).not.toContain('source')
			expect(JSON.stringify(envoye), methode).not.toContain('instagram')
		}
		expect(JSON.stringify(apres.profils[compte.id])).not.toContain('instagram')
		// nor any other request to an API: no URL, no body holds it
		expect(versLApi.length).toBeGreaterThan(corps.length)
		for (const [url, donnees] of versLApi) {
			expect(url).not.toContain('instagram')
			expect(donnees, url).not.toContain('instagram')
		}

		// « Mon profil »: the private page of the account just created, with
		// the name of the onboarding (1 criterion of 13)
		await appuyer(page.getByTestId('profil'))
		await expect(page).toHaveURL(/\/auth\/profil$/)
		await expect(page.getByTestId('resume-name')).toHaveText('Al Bo')
		await expect(barreDeCompletion(page)).toHaveText('8% de complétion')

		// then deleted from there: back home, the account and its profile gone
		await appuyer(page.getByTestId('button-delete-account'))
		await appuyer(page.getByTestId('delete-account'))
		await expect(page).toHaveURL(/\/$/)
		const fin = await etat()
		expect(fin.comptes.map(c => c.email)).not.toContain('nouvelle@test.local')
		expect(fin.profils[compte.id]).toBeUndefined()
		expect(appels(fin.journal, 'DELETE', '/api/me-makeup')).toHaveLength(1)
		expect(erreurs).toEqual([])
	}

	test('RG-07 API lente (2,5 s) : un seul profil créé, le nom attend sa création, « Bienvenue » après l’enregistrement, l’origine jamais enregistrée', async ({
		page,
	}) => {
		await rg07(page)
	})

	test.describe('sur un téléphone', () => {
		// eslint-disable-next-line no-unused-vars
		const { defaultBrowserType, ...iphone } = devices['iPhone 13']
		test.use(iphone)

		test('RG-07 à la taille d’un iPhone 13 : même scénario, au doigt, sans débordement', async ({
			page,
		}) => {
			await rg07(page, { appuyer: cible => cible.tap() })
		})
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

	test('suppression du compte : refusée → message, toujours connectée, photos gardées ; acceptée → déconnectée, ses photos et ses envois supprimés', async ({
		page,
	}) => {
		// her main picture and 2 gallery pictures, one of her uploads on no
		// profile yet, and a file of another account
		const [principale, galerie1, galerie2] = await fichiersStockes(3)
		await profilDeDepart({
			main_picture: principale.id,
			image_gallery: [galerie1.id, galerie2.id],
		})
		const [envoi] = await fichiersStockes(1, COMPTE_TEST.id)
		const [autre] = await fichiersStockes(1, COMPTE_TEST.id + 1)
		const tous = [principale, galerie1, galerie2, envoi, autre].map(f => f.id)

		const erreurs = erreursDeLaPage(page)
		await ouvrirProfil(page)
		await panne({ suppression: 500 })
		await page.getByTestId('button-delete-account').click()
		await page.getByTestId('delete-account').click()
		await expect(page.getByTestId('delete-account-error')).toBeVisible()
		await expect(page).toHaveURL(/\/auth\/profil/)
		expect((await etat()).comptes).toHaveLength(1)
		expect(await idsFichiers()).toEqual(tous)

		await panne({ suppression: null })
		await page.getByTestId('delete-account').click()
		await expect(page).toHaveURL(/\/$/)
		const { comptes, profils, journal, fichiers } = await etat()
		expect(comptes).toHaveLength(0)
		expect(profils[COMPTE_TEST.id]).toBeUndefined()
		expect(appels(journal, 'DELETE', '/api/me-makeup')).toHaveLength(2)
		expect(fichiers.map(f => f.id)).toEqual([autre.id])
		const cookies = await page.context().cookies()
		expect(
			cookies.some(c => c.name.startsWith('next-auth.session-token'))
		).toBe(false)
		expect(erreurs).toEqual([])
	})
})

test.describe('RG-08 session expirée', () => {
	// documents of the main frame loaded from the server (history.replaceState
	// of the Next router is not one), with their status
	function navigations(page) {
		const liste = []
		page.on('response', r => {
			if (r.request().isNavigationRequest() && r.frame() === page.mainFrame())
				liste.push([r.status(), new URL(r.url()).pathname])
		})
		return liste
	}
	const versLaConnexion = liste =>
		liste.filter(([, chemin]) => chemin === '/auth/signin')
	const cheminDe = page => {
		const url = new URL(page.url())
		return url.pathname + url.search
	}
	const sessionPresente = async page =>
		(await page.context().cookies()).some(c =>
			c.name.startsWith('next-auth.session-token')
		)

	test('RG-08 JWT refusé pendant une sauvegarde : une seule redirection vers la connexion, message « session expirée », pas de boucle', async ({
		page,
	}) => {
		await ouvrirProfil(page)
		const vues = navigations(page)
		// Strapi refuses every JWT issued so far (secret rotated, account blocked…)
		await piloter('/__revoquer', {})
		await page.getByTestId('update-description-button').click()
		await page.getByTestId('description-input').fill('Texte jamais enregistré')
		await page.getByTestId('save-button-description').click()

		await expect(page).toHaveURL(/\/auth\/signin\?error=session-expiree$/)
		await expect(page.getByTestId('signin-url-error')).toHaveText(
			'Ta session a expiré, reconnecte-toi.'
		)
		// settled: nothing sends her anywhere else
		await page.waitForLoadState('networkidle')
		expect(versLaConnexion(vues)).toEqual([[200, '/auth/signin']])
		expect(vues).toEqual([[200, '/auth/signin']])
		expect(cheminDe(page)).toBe('/auth/signin?error=session-expiree')
		expect(await sessionPresente(page)).toBe(false)
		expect((await profilServeur()).description).toBe('Description initiale')
	})

	test('RG-08 JWT refusé au chargement de l’espace : une seule redirection (307), message « session expirée », pas de boucle', async ({
		page,
	}) => {
		expect(await connecter(page)).toBe(true)
		// /users/me still says 200, /api/me-makeup refuses the JWT
		await panne({ meMakeup401: true })
		const vues = navigations(page)

		await page.goto('/auth/profil')
		await expect(page).toHaveURL(/\/auth\/signin\?error=session-expiree$/)
		await expect(page.getByTestId('signin-url-error')).toHaveText(
			'Ta session a expiré, reconnecte-toi.'
		)
		await page.waitForLoadState('networkidle')
		expect(vues).toEqual([
			[307, '/auth/profil'],
			[200, '/auth/signin'],
		])
		expect(await sessionPresente(page)).toBe(false)

		// back to the private page: one redirection to the sign-in page, no loop
		await page.goto('/auth/profil')
		await expect(page).toHaveURL(
			/\/auth\/signin\?callbackUrl=%2Fauth%2Fprofil$/
		)
		await page.waitForLoadState('networkidle')
		expect(vues.slice(2)).toEqual([
			[307, '/auth/profil'],
			[200, '/auth/signin'],
		])
	})

	test('RG-08 JWT Strapi expiré à l’ouverture de l’espace : une seule redirection (307) par le middleware, message « session expirée », page gardée, pas de boucle', async ({
		page,
	}) => {
		// 30 s: inside the 60 s margin, the JWT counts as expired
		await panne({ dureeJwtS: 30 })
		expect(await connecter(page)).toBe(true)
		const vues = navigations(page)
		const redirection = page.waitForResponse(
			r => new URL(r.url()).pathname === '/auth/profil'
		)

		await page.goto('/auth/profil')
		await expect(page).toHaveURL(
			/\/auth\/signin\?error=session-expiree&ou=middleware&callbackUrl=%2Fauth%2Fprofil$/
		)
		// the middleware deletes the cookie on the 307 itself, before the
		// sign-in page reads the session
		expect((await redirection).status()).toBe(307)
		expect(await (await redirection).headerValues('set-cookie')).toEqual([
			expect.stringMatching(/^next-auth\.session-token=; .*Max-Age=0/),
		])
		await expect(page.getByTestId('signin-url-error')).toHaveText(
			'Ta session a expiré, reconnecte-toi.'
		)
		await page.waitForLoadState('networkidle')
		expect(vues).toEqual([
			[307, '/auth/profil'],
			[200, '/auth/signin'],
		])
		expect(await sessionPresente(page)).toBe(false)
		expect(appels((await etat()).journal, 'GET', '/api/me-makeup')).toEqual([])
	})

	test('RG-08 JWT révoqué, refusé par /users/me à la lecture de la session : une seule redirection (307), message « session expirée », retour à l’espace après connexion', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		expect(await connecter(page)).toBe(true)
		// every JWT issued so far is refused, /users/me included; run.mjs sets
		// AUTH_REVALIDATION_MS=0, so the session read asks Strapi every time
		await piloter('/__revoquer', {})
		const vues = navigations(page)

		await page.goto('/auth/profil')
		await expect(page).toHaveURL(
			/\/auth\/signin\?error=session-expiree&ou=jwt_expire&callbackUrl=%2Fauth%2Fprofil$/
		)
		await expect(page.getByTestId('signin-url-error')).toHaveText(
			'Ta session a expiré, reconnecte-toi.'
		)
		await page.waitForLoadState('networkidle')
		expect(vues).toEqual([
			[307, '/auth/profil'],
			[200, '/auth/signin'],
		])
		expect(await sessionPresente(page)).toBe(false)

		// signing in again goes back to the page she asked for
		await page.getByTestId('email-input').fill(COMPTE_TEST.email)
		await page.getByTestId('password-input').fill(COMPTE_TEST.password)
		await page.getByTestId('email-signin').click()
		await expect(page).toHaveURL(/\/auth\/profil$/)
		await expect(page.getByTestId('resume-name')).toHaveText('Testine Recette')
		expect(erreurs).toEqual([])
	})

	test('RG-08 JWT Strapi expiré, clic sur « Profil » dans le menu (navigation côté client) : message « session expirée », page gardée, pas de boucle', async ({
		page,
	}) => {
		expect(await connecter(page)).toBe(true)
		await aller(page, '/')
		const lien = page.getByRole('link', { name: 'Profil', exact: true })
		await expect(lien).toBeVisible()
		// a new session whose JWT is already inside the 60 s margin, that the
		// open page has not read: as if it expired while she was reading
		await panne({ dureeJwtS: 30 })
		expect(await connecter(page)).toBe(true)
		const vues = navigations(page)

		await lien.click()
		await expect(page).toHaveURL(
			/\/auth\/signin\?error=session-expiree&ou=middleware&callbackUrl=%2Fauth%2Fprofil$/
		)
		await expect(page.getByTestId('signin-url-error')).toHaveText(
			'Ta session a expiré, reconnecte-toi.'
		)
		await page.waitForLoadState('networkidle')
		expect(versLaConnexion(vues).length).toBeLessThanOrEqual(1)
		expect(await sessionPresente(page)).toBe(false)
		expect(appels((await etat()).journal, 'GET', '/api/me-makeup')).toEqual([])
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

	test('navigateur sans AbortSignal.timeout (iOS 15) : la demande de lien et la réinitialisation aboutissent', async ({
		page,
	}) => {
		await page.addInitScript(() => {
			delete AbortSignal.timeout
		})
		expect(await demander(page, COMPTE_TEST.email)).toMatch(
			/^Si un compte existe avec cette adresse/
		)
		expect(await page.evaluate(() => typeof AbortSignal.timeout)).toBe(
			'undefined'
		)
		const [{ code }] = (await etat()).emails
		await aller(page, `/auth/reinitialiser?code=${code}`)
		await page.getByTestId('reset-password-input').fill('Nouveau-mdp-5')
		await page.getByTestId('reset-confirmation-input').fill('Nouveau-mdp-5')
		await page.getByTestId('reset-submit').click()
		await expect(page.getByTestId('reset-result')).toBeVisible()
		expect(
			(await etat()).journal.filter(
				e => e.m === 'POST' && e.p === '/api/auth/reset-password'
			)
		).toHaveLength(1)
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
		const erreurs = erreursDeLaPage(page)
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
		expect(erreurs).toEqual([])
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
