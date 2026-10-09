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
