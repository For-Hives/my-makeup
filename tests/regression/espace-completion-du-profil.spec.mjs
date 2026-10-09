import { expect, test } from '@playwright/test'
import {
	AUTRE_COULEUR,
	ajouterAuPortfolio,
	barreDeCompletion,
	choisirPhotoProfil,
	corpsDesPatchs,
	erreursDeLaPage,
	petitePng,
	remplir,
	SPECIALITE_65,
	sauver,
} from './espace-helpers.mjs'
import { COMPTE_TEST } from './mock-api.mjs'
import { aller, appels, etat, ouvrirProfil, profilDeDepart, reinitialiserStrapi } from './outils-strapi.mjs'

test.use({ testIdAttribute: 'data-cy' })

test.beforeEach(async () => {
	await reinitialiserStrapi()
})

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
		await expect(page.getByTestId('location-city-action-radius').first()).toHaveText('Chambéry et 5 km autour')
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
