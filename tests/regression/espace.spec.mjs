import { expect, test } from '@playwright/test'
import { dialogue, EXPERIENCE, erreursDeLaPage, OFFRE_AVEC_OPTION } from './espace-helpers.mjs'
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

test.describe('UI-01 sauvegardes honnêtes', () => {
	registerUi01SauvegardesHonnetes1()
	registerUi01SauvegardesHonnetes2()
	registerUi01SauvegardesHonnetes3()
	registerUi01SauvegardesHonnetes4()
	registerUi01SauvegardesHonnetes5()
	registerUi01SauvegardesHonnetes6()
	registerUi01SauvegardesHonnetes7()
	registerUi01SauvegardesHonnetes8()
	registerUi01SauvegardesHonnetes9()
})

function registerUi01SauvegardesHonnetes1() {
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
		await expect(page.getByTestId('description').first()).toHaveText('Nouvelle description enregistrée')
		expect((await profilServeur()).description).toBe('Nouvelle description enregistrée')

		await aller(page, '/auth/profil')
		await expect(page.getByTestId('description').first()).toHaveText('Nouvelle description enregistrée')
	})
}

function registerUi01SauvegardesHonnetes2() {
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
		await expect(page.getByTestId('description').first()).toHaveText('Description initiale')
		await expect(page.getByTestId('save-button-description')).toBeEnabled()
		expect((await profilServeur()).description).toBe('Description initiale')

		// the API is back: the same text is saved without typing it again
		await panne({ patch: null })
		await page.getByTestId('save-button-description').click()
		await expect(champ).toBeHidden()
		await expect(page.getByTestId('description').first()).toHaveText('Texte qui ne sera pas enregistré')
		expect((await profilServeur()).description).toBe('Texte qui ne sera pas enregistré')
	})
}

function registerUi01SauvegardesHonnetes3() {
	test('RG-01 PATCH en échec puis modale fermée : la page garde la valeur enregistrée', async ({ page }) => {
		await ouvrirProfil(page)
		await panne({ patch: 500 })
		await page.getByTestId('update-location-button').click()
		await page.getByTestId('city-input').fill('Chambéry')
		await page.getByTestId('save-button-location').click()
		await expect(dialogue(page).getByTestId('save-error')).toBeVisible()
		await page.keyboard.press('Escape')
		await expect(dialogue(page)).toBeHidden()
		await expect(page.getByTestId('location-city-action-radius').first()).toContainText('Annecy')
		expect((await profilServeur()).city).toBe('Annecy')
	})
}

function registerUi01SauvegardesHonnetes4() {
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
		expect(appels((await etat()).journal, 'PATCH', '/api/me-makeup')).toHaveLength(0)
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
}

function registerUi01SauvegardesHonnetes5() {
	test('RG-03 expérience modifiée puis modale fermée sans sauvegarder : valeur d’origine partout', async ({ page }) => {
		await ouvrirProfil(page)
		await page.getByTestId('update-experience-button').click()
		await page.getByTestId('experience-selected-0').click()
		await page.getByTestId('company-input').fill('Studio MODIFIE')
		await page.getByTestId('add-experience-button').click()
		await expect(dialogue(page)).toContainText('Studio MODIFIE')

		await page.keyboard.press('Escape')
		await expect(dialogue(page)).toBeHidden()
		await expect(page.getByTestId('experience-company').first()).toHaveText('Studio A')
		await page.getByTestId('update-experience-button').click()
		await expect(dialogue(page)).toContainText('Studio A')
		await expect(dialogue(page)).not.toContainText('Studio MODIFIE')

		const { journal, profils } = await etat()
		expect(appels(journal, 'PATCH', '/api/me-makeup')).toHaveLength(0)
		expect(profils[COMPTE_TEST.id].experiences[0].company).toBe('Studio A')
	})
}

function registerUi01SauvegardesHonnetes6() {
	test('expérience modifiée et sauvegardée : envoyée, affichée, et encore modifiable', async ({ page }) => {
		await ouvrirProfil(page)
		await page.getByTestId('update-experience-button').click()
		await page.getByTestId('experience-selected-0').click()
		await page.getByTestId('company-input').fill('Studio B')
		await page.getByTestId('add-experience-button').click()
		await page.getByTestId('save-button-experience').click()
		await expect(dialogue(page)).toBeHidden()
		await expect(page.getByTestId('experience-company').first()).toHaveText('Studio B')
		expect((await profilServeur()).experiences[0].company).toBe('Studio B')

		// the saved item can be edited again without reloading
		await page.getByTestId('update-experience-button').click()
		await page.getByTestId('experience-selected-0').click()
		await expect(page.getByTestId('company-input')).toHaveValue('Studio B')
	})
}

function registerUi01SauvegardesHonnetes7() {
	test('deux expériences : la 2e puis la 1re modifiées et sauvegardées sans recharger, chacune à sa place', async ({
		page,
	}) => {
		await profilDeDepart({
			experiences: [EXPERIENCE('Studio A', '2020-01-01'), EXPERIENCE('Studio B', '2022-01-01')],
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

		await expect(page.getByTestId('experience-company')).toHaveText(['Studio A2', 'Studio B2'])
		const { experiences } = await profilServeur()
		expect(experiences.map(e => e.company)).toEqual(['Studio A2', 'Studio B2'])
		expect(experiences.map(e => e.date_start)).toEqual(['2020-01-01', '2022-01-01'])
	})
}

function registerUi01SauvegardesHonnetes8() {
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
		await page.getByTestId('description-service-offers-input').fill('Description de l’offre B')
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
		await expect(page.getByTestId('name-service-offers-option-input-0')).toHaveValue('Option 1')
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
}

function registerUi01SauvegardesHonnetes9() {
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
}
