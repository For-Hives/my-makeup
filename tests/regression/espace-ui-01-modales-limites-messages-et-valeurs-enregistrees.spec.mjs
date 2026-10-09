import { expect, test } from '@playwright/test'
import { ADRESSE_FICTIVE, RUE_FICTIVE } from './donnees-publiques.mjs'
import {
	corpsDesPatchs,
	dialogue,
	EXPERIENCE,
	erreursDeLaPage,
	OFFRE_AVEC_OPTION,
	remplir,
	SPECIALITE_65,
	sauver,
	valeursDeLaModale,
} from './espace-helpers.mjs'
import { aller, ouvrirProfil, profilDeDepart, profilServeur, reinitialiserStrapi } from './outils-strapi.mjs'

test.use({ testIdAttribute: 'data-cy' })

test.beforeEach(async () => {
	await reinitialiserStrapi()
})

test.describe('UI-01 modales : limites, messages et valeurs enregistrées', () => {
	registerUi01ModalesLimitesMessages10()
	registerUi01ModalesLimitesMessages11()
	registerUi01ModalesLimitesMessages12()
	registerUi01ModalesLimitesMessages13()
	registerUi01ModalesLimitesMessages14()
	registerUi01ModalesLimitesMessages15()
	registerUi01ModalesLimitesMessages16()
	registerUi01ModalesLimitesMessages17()
	registerUi01ModalesLimitesMessages18()
	registerUi01ModalesLimitesMessages19()
	registerUi01ModalesLimitesMessages20()
	registerUi01ModalesLimitesMessages21()
	registerUi01ModalesLimitesMessages22()
	registerUi01ModalesLimitesMessages23()
	registerUi01ModalesLimitesMessages24()
	registerUi01ModalesLimitesMessages25()
})

function registerUi01ModalesLimitesMessages10() {
	test('résumé : prénom et nom vides, puis 71 caractères dans les 4 champs, refusés dans la modale sans appel ; 70 caractères enregistrés', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		await ouvrirProfil(page)
		await page.getByTestId('update-resume-button').click()
		const erreur = cy => dialogue(page).getByTestId(cy)

		// empty names: the rule of 2 characters (UI-01)
		await remplir(page, { 'first-name-input': '', 'last-name-input': '' })
		await page.getByTestId('save-button-resume').click()
		await expect(erreur('error-first-name')).toHaveText('Le prénom doit contenir au moins 2 caractères.')
		await expect(erreur('error-last-name')).toHaveText('Le nom doit contenir au moins 2 caractères.')

		// 71 characters, typed in full
		const a71 = 'a'.repeat(71)
		await remplir(page, {
			'first-name-input': a71,
			'last-name-input': a71,
			'speciality-input': a71,
			'company-artist-input': a71,
		})
		await page.getByTestId('save-button-resume').click()
		await expect(erreur('error-first-name')).toHaveText('Le prénom ne doit pas dépasser 70 caractères.')
		await expect(erreur('error-last-name')).toHaveText('Le nom ne doit pas dépasser 70 caractères.')
		await expect(erreur('error-speciality')).toHaveText('La spécialité ne doit pas dépasser 70 caractères.')
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
		expect(erreurs).toEqual([])
	})
}

function registerUi01ModalesLimitesMessages11() {
	test('résumé : prénom, nom, spécialité de 65 caractères et nom d’entreprise enregistrés, affichés en tête de l’espace puis dans sa vue publique', async ({
		page,
	}) => {
		expect(SPECIALITE_65).toHaveLength(65)
		const erreurs = erreursDeLaPage(page)
		await ouvrirProfil(page)
		await page.getByTestId('update-resume-button').click()
		await remplir(page, {
			'first-name-input': 'Alix',
			'last-name-input': 'Nantaise',
			'speciality-input': SPECIALITE_65,
			'company-artist-input': 'Studio Nantes',
		})
		await sauver(page, 'save-button-resume')
		expect(await profilServeur()).toMatchObject({
			first_name: 'Alix',
			last_name: 'Nantaise',
			speciality: SPECIALITE_65,
			company_artist_name: 'Studio Nantes',
		})
		for (const vue of ['édition', 'publique']) {
			if (vue === 'publique') {
				// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
				await page.getByTestId('profil-public-view').click()
				await expect(page).toHaveURL(/publicView=true/)
				await expect(page.getByTestId('update-resume-button')).toHaveCount(0)
			}
			await expect(page.getByTestId('resume-name'), vue).toHaveText('Alix Nantaise')
			await expect(page.getByTestId('resume-speciality'), vue).toHaveText(SPECIALITE_65)
			await expect(page.getByTestId('resume-company-artist-name'), vue).toHaveText('Studio Nantes')
		}
		expect(erreurs).toEqual([])
	})
}

function registerUi01ModalesLimitesMessages12() {
	test('description : 2001 caractères refusés, puis vidée et enregistrée dans la même modale ; 2000 caractères enregistrés, affichés aussi en vue publique', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		await ouvrirProfil(page)
		await page.getByTestId('update-description-button').click()
		const erreur = dialogue(page).getByTestId('error-description')
		await remplir(page, { 'description-input': 'a'.repeat(2001) })
		await page.getByTestId('save-button-description').click()
		await expect(erreur).toHaveText('La description ne doit pas dépasser 2000 caractères.')
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
		for (const vue of ['édition', 'publique']) {
			if (vue === 'publique') {
				// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
				await page.getByTestId('profil-public-view').click()
				await expect(page).toHaveURL(/publicView=true/)
				await expect(page.getByTestId('update-description-button')).toHaveCount(0)
			}
			await expect(page.getByTestId('description'), vue).toHaveText('b'.repeat(2000))
		}
		expect(erreurs).toEqual([])
	})
}

function registerUi01ModalesLimitesMessages13() {
	test('localisation : ville de 71 caractères et rayon de plus de 1000 km refusés, puis vidés et enregistrés dans la même modale ; ni carte, ni « à & dans un rayon de km » en tête', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
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
			"Le rayon d'action ne doit pas dépasser 1000 km."
		)
		expect(patchs).toEqual([])

		// whole kilometres only: the API refuses a negative or a decimal value
		await remplir(page, {
			'city-input': 'Annecy',
			'action-radius-input': '1001',
		})
		await page.getByTestId('save-button-location').click()
		await expect(dialogue(page).getByTestId('error-action-radius')).toHaveText(
			"Le rayon d'action ne doit pas dépasser 1000 km."
		)
		for (const rayon of ['-5', '2.5']) {
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			await remplir(page, { 'action-radius-input': rayon })
			await page.getByTestId('save-button-location').click()
			await expect(dialogue(page).getByTestId('error-action-radius')).toHaveText(
				"Le rayon d'action est un nombre entier de kilomètres."
			)
		}
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
				// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
				await page.getByTestId('profil-public-view').click()
				await expect(page).toHaveURL(/publicView=true/)
			}
			await expect(page.getByTestId('location-city-action-radius'), vue).toHaveCount(0)
			await expect(page.getByTestId('resume-city-action-radius'), vue).toHaveCount(0)
			await expect(page.locator('main'), vue).not.toContainText('rayon de km')
		}
		expect(erreurs).toEqual([])
	})
}

function registerUi01ModalesLimitesMessages14() {
	test('localisation : Nantes et 5 km enregistrés, dans la phrase de la tête et la carte, aussi en vue publique', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		await ouvrirProfil(page)
		await page.getByTestId('update-location-button').click()
		await remplir(page, { 'city-input': 'Nantes', 'action-radius-input': '5' })
		await sauver(page, 'save-button-location')
		// one call, the radius 5 whether sent as typed or as a number (the
		// API stores an integer)
		expect(patchs).toHaveLength(1)
		expect(Object.keys(patchs[0]).sort()).toEqual(['action_radius', 'city'])
		expect(patchs[0].city).toBe('Nantes')
		expect(Number(patchs[0].action_radius)).toBe(5)
		expect((await profilServeur()).city).toBe('Nantes')
		for (const vue of ['édition', 'publique']) {
			if (vue === 'publique') {
				// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
				await page.getByTestId('profil-public-view').click()
				await expect(page).toHaveURL(/publicView=true/)
			}
			await expect(page.getByTestId('resume-city-action-radius'), vue).toHaveText(
				'peut se déplacer à Nantes & dans un rayon de 5km'
			)
			await expect(page.getByTestId('location-city-action-radius').first(), vue).toHaveText('Nantes et 5 km autour')
		}
		expect(erreurs).toEqual([])
	})
}

function registerUi01ModalesLimitesMessages15() {
	test('localisation : une ville sans rayon (0 enregistré, puis rayon vidé dans la modale) : « peut se déplacer à … » sans rayon ni « km », en tête et en vue publique, sans carte de zone', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		// a radius of 0, as some profiles hold it (format-zone.js)
		await profilDeDepart({ city: 'Annecy', action_radius: 0 })
		await ouvrirProfil(page)
		const tete = page.getByTestId('resume-city-action-radius')
		const zone = page.getByTestId('location-city-action-radius')
		await expect(tete).toHaveText('peut se déplacer à Annecy')
		await expect(tete).not.toContainText('rayon')
		await expect(zone).toHaveCount(0)

		await page.getByTestId('update-location-button').click()
		await valeursDeLaModale(page, {
			'city-input': 'Annecy',
			'action-radius-input': '0',
		})
		await remplir(page, { 'city-input': 'Nantes', 'action-radius-input': '' })
		await sauver(page, 'save-button-location')
		expect(patchs).toEqual([{ city: 'Nantes', action_radius: null }])
		expect(await profilServeur()).toMatchObject({
			city: 'Nantes',
			action_radius: null,
		})
		for (const vue of ['édition', 'publique', 'rechargement']) {
			if (vue === 'publique') {
				// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
				await page.getByTestId('profil-public-view').click()
				await expect(page).toHaveURL(/publicView=true/)
			} else if (vue === 'rechargement') await aller(page, '/auth/profil?publicView=true')
			await expect(tete, vue).toHaveText('peut se déplacer à Nantes')
			await expect(tete, vue).not.toContainText('rayon')
			await expect(tete, vue).not.toContainText('km')
			await expect(zone, vue).toHaveCount(0)
			// the city alone in the location card
			await expect(page.getByText('Nantes', { exact: true }), vue).toBeVisible()
		}
		expect(erreurs).toEqual([])
	})
}

function registerUi01ModalesLimitesMessages16() {
	test('localisation : une adresse postale tapée comme ville, en entier dans l’espace ; la commune seule en tête de la vue publique, rechargée aussi, la rue nulle part', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		await profilDeDepart({ city: ADRESSE_FICTIVE, action_radius: 30 })
		await ouvrirProfil(page)
		const tete = page.getByTestId('resume-city-action-radius')
		await expect(tete).toHaveText(`peut se déplacer à ${ADRESSE_FICTIVE} & dans un rayon de 30km`)
		for (const vue of ['bascule', 'rechargement']) {
			if (vue === 'bascule') {
				// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
				await page.getByTestId('profil-public-view').click()
				await expect(page).toHaveURL(/publicView=true/)
			} else await aller(page, '/auth/profil?publicView=true')
			await expect(tete, vue).toHaveText('peut se déplacer à Thonon-les-Bains (74) & dans un rayon de 30km')
			await expect(page.getByTestId('location-city-action-radius').first(), vue).toHaveText(
				'Thonon-les-Bains (74) et 30 km autour'
			)
			for (const morceau of RUE_FICTIVE) {
				// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
				await expect(page.locator('main'), `${vue} ${morceau}`).not.toContainText(morceau)
			}
		}
		expect(erreurs).toEqual([])
	})
}

function registerUi01ModalesLimitesMessages17() {
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
		// pasted with its separator, 71 characters are refused too, and stay
		// in the field without the « ; » to be corrected
		await champ.fill(`${'a'.repeat(71)};`)
		await expect(erreur).toHaveText(tropLongue)
		await expect(champ).toHaveValue('a'.repeat(71))
		await expect(puces).toHaveCount(2)
		await champ.fill('')
		await sauver(page, 'save-button-skills')
		expect(patchs[1]).toEqual({ skills: [{ name: 'pieds' }, { name: 'yeux' }] })
		expect((await profilServeur()).skills.map(s => s.name)).toEqual(['pieds', 'yeux'])

		// shown on the page, in the public view, and once reloaded
		await expect(page.getByTestId('skill')).toHaveText(['pieds', 'yeux'])
		await page.getByTestId('profil-public-view').click()
		await expect(page).toHaveURL(/publicView=true/)
		await expect(page.getByTestId('skill')).toHaveText(['pieds', 'yeux'])
		await aller(page, '/auth/profil')
		await expect(page.getByTestId('skill')).toHaveText(['pieds', 'yeux'])
		expect(erreurs).toEqual([])
	})
}

function registerUi01ModalesLimitesMessages18() {
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
		// the separator typed after it: the name stays, without the « ; »
		await champ.press(';')
		await expect(erreur).toHaveText(tropLongue)
		await expect(champ).toHaveValue('a'.repeat(71))
		// pasted with its separator in one go, on a fresh field
		await champ.fill('')
		await champ.fill(`${'a'.repeat(71)};`)
		await expect(erreur).toHaveText(tropLongue)
		await expect(champ).toHaveValue('a'.repeat(71))
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
}

function registerUi01ModalesLimitesMessages19() {
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
		await dialogue(page).getByRole('button', { name: 'Retirer la formation CAP' }).click()
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
		for (const [cy, message] of Object.entries(messages)) {
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			await expect(dialogue(page).getByTestId(cy), cy).toHaveText(message)
		}
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
		for (const cy of Object.keys(messages)) {
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			await expect(dialogue(page).getByTestId(cy), cy).toHaveCount(0)
		}
		await expect(formations).toHaveCount(1)
		await sauver(page, 'save-button-courses')
		// no id sent: Strapi creates the components again
		expect(patchs[1]).toEqual({ courses: [formation] })
		expect((await profilServeur()).courses).toMatchObject([formation])

		// opened again without reloading: the form holds what was saved
		await page.getByTestId('update-courses-button').click()
		await page.getByTestId('course-edit-button-0').click()
		await valeursDeLaModale(page, champs(formation))
		await expect(page.getByTestId('add-course-button')).toHaveText('Modifier la formation / diplôme')
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
				// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
				await page.getByTestId('profil-public-view').click()
				await expect(page).toHaveURL(/publicView=true/)
			}
			await expect(page.getByTestId('course-diploma'), vue).toHaveText(['EpsiModified'])
			await expect(page.getByTestId('course-school'), vue).toHaveText('epsiModified')
			await expect(page.getByTestId('course-date-graduation'), vue).toHaveText('2022-10-10')
			await expect(page.getByTestId('course-description'), vue).toHaveText('informatiqueModified')
		}
		expect(erreurs).toEqual([])
	})
}

function registerUi01ModalesLimitesMessages20() {
	test('expériences : les deux retirées et enregistrées ; 5 messages sur le formulaire vide ; une ajoutée, rouverte avec ses 6 champs, modifiée sur place, lue en vue publique', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		await profilDeDepart({
			experiences: [EXPERIENCE('Studio A', '2020-01-01'), EXPERIENCE('Studio B', '2022-01-01')],
		})
		await ouvrirProfil(page)
		const listees = dialogue(page).getByTestId('experience-selected')

		await page.getByTestId('update-experience-button').click()
		await expect(listees).toHaveCount(2)
		for (const studio of ['Studio A', 'Studio B']) {
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			await dialogue(page)
				.getByRole('button', { name: `Retirer l'expérience ${studio}` })
				.click()
		}
		await expect(listees).toHaveCount(0)
		await sauver(page, 'save-button-experience')
		expect(patchs).toEqual([{ experiences: [] }])
		expect((await profilServeur()).experiences).toEqual([])
		await expect(page.getByTestId('experience-company')).toHaveCount(0)

		// the empty form: 5 required messages, the start date included (the API
		// refuses an empty date), nothing listed
		await page.getByTestId('update-experience-button').click()
		await page.getByTestId('add-experience-button').click()
		const messages = {
			'error-company': "Le nom de l'entreprise est requis.",
			'error-job-name': "Le nom de l'expérience est requis.",
			'error-city': 'La ville est requise.',
			'error-date-start': "La date de début de l'expérience est requise.",
			'error-description-experience': 'La description est requise.',
		}
		for (const [cy, message] of Object.entries(messages)) {
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			await expect(dialogue(page).getByTestId(cy), cy).toHaveText(message)
		}
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
		for (const cy of Object.keys(messages)) {
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			await expect(dialogue(page).getByTestId(cy), cy).toHaveCount(0)
		}
		await expect(listees).toHaveCount(1)
		await expect(dialogue(page)).toContainText('ForHives')
		await sauver(page, 'save-button-experience')
		expect(patchs[1]).toEqual({ experiences: [experience] })

		// opened again without reloading: the edit button loads the 6 fields
		// of the experience added in this session
		await page.getByTestId('update-experience-button').click()
		await page.getByTestId('experience-selected-0').click()
		await valeursDeLaModale(page, champs(experience))
		await expect(page.getByTestId('add-experience-button')).toHaveText('Modifier une expérience')
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
		await expect(page.getByTestId('experience-company')).toHaveText(['ForHivesModified'])
		await expect(page.getByTestId('experience-job-name')).toHaveText('devModified')
		await expect(page.getByTestId('experience-city')).toHaveText('à NantesModified')
		await expect(page.getByTestId('experience-date')).toHaveText('mai 2021 - mai 2023')
		await expect(page.getByTestId('experience-description')).toHaveText('informatiqueModified')
		expect(erreurs).toEqual([])
	})
}

function registerUi01ModalesLimitesMessages21() {
	test('réseaux : « 0 » partout puis des valeurs trop longues refusés sans appel ; les 7 canaux enregistrés d’un appel, lus en vue publique ; tous vidés ensuite', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		await ouvrirProfil(page)
		const URLS = ['facebook', 'instagram', 'linkedin', 'website', 'youtube']
		const CANAUX = [...URLS, 'email', 'phone']
		const saisie = valeur => Object.fromEntries(CANAUX.map(c => [`${c}-input`, valeur(c)]))
		const erreur = canal => dialogue(page).getByTestId(`error-${canal}`)
		await page.getByTestId('update-social-medias-button').click()

		// « 0 »: neither a URL, nor an email, nor a phone number
		await remplir(
			page,
			saisie(() => '0')
		)
		await page.getByTestId('save-button-social-medias').click()
		await expect(erreur('email')).toHaveText('Veuillez entrer un email valide.')
		for (const canal of URLS) {
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			await expect(erreur(canal), canal).toHaveText('Veuillez entrer une URL valide (https://...).')
		}
		await expect(erreur('phone')).toHaveText('Le numéro de téléphone est requis.')
		expect(patchs).toEqual([])

		// valid, but over the limits of the API (200, phone 20)
		await remplir(
			page,
			saisie(c => renderEspaceuimodaleslimitesmessagesetvaleursenregistreesState1({ c }))
		)
		await page.getByTestId('save-button-social-medias').click()
		await expect(erreur('email')).toHaveText("L'email ne doit pas dépasser 200 caractères.")
		for (const canal of URLS) {
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			await expect(erreur(canal), canal).toHaveText("L'URL ne doit pas dépasser 200 caractères.")
		}
		await expect(erreur('phone')).toHaveText('Le numéro de téléphone ne doit pas dépasser 20 caractères.')
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
				// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
				await page.getByTestId('profil-public-view').click()
				await expect(page).toHaveURL(/publicView=true/)
			}
			for (const canal of CANAUX) {
				// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
				await expect(page.getByTestId(canal), `${vue} ${canal}`).toHaveText(reseau[canal])
			}
			// data-cy is on the text, inside the link
			await expect(page.locator('a', { has: page.getByTestId('email') })).toHaveAttribute(
				'href',
				'mailto:test@example.test'
			)
			await expect(page.locator('a', { has: page.getByTestId('phone') })).toHaveAttribute('href', 'tel:0606060606')
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
		for (const canal of CANAUX) {
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			await expect(page.getByTestId(canal), canal).toHaveCount(0)
		}
		expect(erreurs).toEqual([])
	})
}

function registerUi01ModalesLimitesMessages22() {
	test('prestations : retirée puis modale fermée, rien n’est enregistré ; retirée et sauvegardée, elle quitte le profil et la page', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
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
		expect((await profilServeur()).service_offers.map(o => o.name)).toEqual(['Offre A', 'Offre B'])

		await page.getByTestId('update-service-offers-button').click()
		await retirerA.click()
		await sauver(page, 'save-button-service-offers')
		expect(patchs).toEqual([{ service_offers: [OFFRE_B] }])
		expect((await profilServeur()).service_offers.map(o => o.name)).toEqual(['Offre B'])
		await expect(page.getByTestId('service-offer-name')).toHaveText(['Offre B'])
		await expect(page.getByText('Offre A', { exact: true })).toHaveCount(0)
		expect(erreurs).toEqual([])
	})
}

function registerUi01ModalesLimitesMessages23() {
	test('prestation : nom, prix et description requis pour l’offre et ses 3 options ; 71 / 71 / 2001 caractères refusés ; 70 / 70 / 2000 acceptés et enregistrés tels quels', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		await ouvrirProfil(page)
		const erreur = cy => dialogue(page).getByTestId(cy)
		const listees = dialogue(page).getByTestId('delete-service-offers-button')
		// data-cy of the fields, and suffix of their messages, of the offer
		// ('') and of options 0 to 2
		const PARTIES = [['', ''], ...[0, 1, 2].map(i => [`option-input-${i}`, `-${i}`])]
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
				// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
				await expect(erreur(`error-name${suffixe}`)).toHaveText(nom)
				await expect(erreur(`error-price${suffixe}`)).toHaveText(prix)
				await expect(erreur(`error-description${suffixe}`)).toHaveText(description)
			}
		}

		await page.getByTestId('update-service-offers-button').click()
		for (let i = 0; i < 3; i++) {
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			await page.getByTestId('add-service-offers-option-button').click()
		}
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
		for (const [, suffixe] of PARTIES) {
			for (const champ of ['name', 'price', 'description']) {
				// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
				await expect(erreur(`error-${champ}${suffixe}`)).toHaveCount(0)
			}
		}
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
		expect(erreurs).toEqual([])
	})
}

function registerUi01ModalesLimitesMessages24() {
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
		for (let i = 0; i < 3; i++) {
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			await page.getByTestId('add-service-offers-option-button').click()
		}
		await remplir(page, champs(offre('')))
		await page.getByTestId('add-service-offers-button').click()
		await sauver(page, 'save-button-service-offers')
		expect(await stockees()).toEqual([offre('')])

		// opened again: the edit button loads the offer and its 3 options
		await page.getByTestId('update-service-offers-button').click()
		await page.getByTestId('edit-service-offers-button-0').click()
		await valeursDeLaModale(page, champs(offre('')))
		await expect(page.getByTestId('add-service-offers-button')).toHaveText('Modifier une prestation')
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
				// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
				await page.getByTestId('profil-public-view').click()
				await expect(page).toHaveURL(/publicView=true/)
			} else await aller(page, '/auth/profil?publicView=true')
			await expect(page.getByTestId('service-offer-name')).toHaveText(attendue.name)
			await expect(page.getByTestId('service-offer-description')).toHaveText(attendue.description)
			await expect(page.getByTestId('service-offer-price')).toHaveText(attendue.price)
			for (const [i, option] of attendue.options.entries()) {
				const description = page.getByTestId(`service-offer-description-${i}`)
				const prix = page.getByTestId(`service-offer-price-${i}`)
				// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
				await expect(page.getByTestId(`service-offer-name-${i}`)).toHaveText(option.name)
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
}

function registerUi01ModalesLimitesMessages25() {
	test('formations, expériences et prestations : celles enregistrées retirées et une nouvelle ajoutée dans la même modale, une seule sauvegarde chacune ; le PATCH, le profil et la page n’ont que la nouvelle', async ({
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
			experiences: [EXPERIENCE('Studio A', '2020-01-01'), EXPERIENCE('Studio B', '2022-01-01')],
			service_offers: [OFFRE_AVEC_OPTION],
		})
		await ouvrirProfil(page)
		const retirer = name => dialogue(page).getByRole('button', { name }).click()

		const formation = {
			diploma: 'BTS Maquillage',
			school: 'École B',
			date_graduation: '2021-06-30',
			course_description: 'Alternance',
		}
		await page.getByTestId('update-courses-button').click()
		await retirer('Retirer la formation CAP')
		await remplir(page, {
			'diploma-input': formation.diploma,
			'school-input': formation.school,
			'date-graduation-input': formation.date_graduation,
			'course-description-input': formation.course_description,
		})
		await page.getByTestId('add-course-button').click()
		await expect(dialogue(page).getByTestId('course-delete-button')).toHaveCount(1)
		await sauver(page, 'save-button-courses')
		expect(patchs).toEqual([{ courses: [formation] }])
		expect((await profilServeur()).courses).toMatchObject([formation])

		const experience = {
			company: 'Studio C',
			job_name: 'Maquilleuse plateau',
			city: 'Lyon',
			date_start: '2023-01-01',
			date_end: '2024-06-30',
			description: 'Tournage',
		}
		await page.getByTestId('update-experience-button').click()
		await retirer("Retirer l'expérience Studio A")
		await retirer("Retirer l'expérience Studio B")
		await remplir(page, {
			'company-input': experience.company,
			'job-name-input': experience.job_name,
			'city-input': experience.city,
			'date-start-input': experience.date_start,
			'date-end-input': experience.date_end,
			'description-experience-input': experience.description,
		})
		await page.getByTestId('add-experience-button').click()
		await expect(dialogue(page).getByTestId('experience-selected')).toHaveCount(1)
		await sauver(page, 'save-button-experience')
		expect(patchs[1]).toEqual({ experiences: [experience] })
		expect((await profilServeur()).experiences).toMatchObject([experience])

		const offre = {
			name: 'Offre C',
			price: '80',
			description: 'Description de l’offre C',
			options: [{ name: 'Option C', price: '15', description: 'Option de l’offre C' }],
		}
		await page.getByTestId('update-service-offers-button').click()
		await retirer('Retirer la prestation Offre A')
		await page.getByTestId('add-service-offers-option-button').click()
		await remplir(page, {
			'name-service-offers-input': offre.name,
			'price-service-offers-input': offre.price,
			'description-service-offers-input': offre.description,
			'name-service-offers-option-input-0': offre.options[0].name,
			'price-service-offers-option-input-0': offre.options[0].price,
			'description-service-offers-option-input-0': offre.options[0].description,
		})
		await page.getByTestId('add-service-offers-button').click()
		await expect(dialogue(page).getByTestId('delete-service-offers-button')).toHaveCount(1)
		await sauver(page, 'save-button-service-offers')
		expect(patchs[2]).toEqual({ service_offers: [offre] })
		expect(patchs).toHaveLength(3)
		expect((await profilServeur()).service_offers).toMatchObject([offre])

		// on the page without a reload, then read again from the fake Strapi
		for (const chargement of ['sans rechargement', 'rechargement']) {
			if (chargement === 'rechargement')
				// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
				await aller(page, '/auth/profil')
			await expect(page.getByTestId('course-diploma'), chargement).toHaveText([formation.diploma])
			await expect(page.getByTestId('experience-company'), chargement).toHaveText([experience.company])
			await expect(page.getByTestId('service-offer-name'), chargement).toHaveText([offre.name])
		}
		expect(erreurs).toEqual([])
	})
}

function renderEspaceuimodaleslimitesmessagesetvaleursenregistreesState1({ c }) {
	if (c === 'email') {
		return `${'a'.repeat(200)}@a.fr`
	}
	if (c === 'phone') {
		return `${'06'.repeat(10)}0`
	}
	return `https://${'a'.repeat(200)}.fr`
}
