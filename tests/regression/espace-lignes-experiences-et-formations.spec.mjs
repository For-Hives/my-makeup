// Rows of the experiences and courses modals (review of #963). « Modifier »
// and « Retirer » find a row by its id. A row added in the modal took an id
// built from its two names, so two rows with the same names were removed and
// overwritten together; and removing the row loaded in the form left the
// form in edit mode, where its button updated nothing and emptied the fields.
// Removed with the keyboard, the last row of the list took the focus out of
// the modal with it. With the focus kept in the modal, Enter held on a button
// clicked it again each time the key repeated, and the « Retirer » focused
// took the name of the row below without a word for screen readers (review
// of #968).
import { expect, test } from '@playwright/test'
import {
	annoncesDites,
	corpsDesPatchs,
	dialogue,
	erreursDeLaPage,
	remplir,
	sauver,
	valeursDeLaModale,
	zoneAnnonce,
} from './espace-helpers.mjs'
import { ouvrirProfil, profilDeDepart, profilServeur, reinitialiserStrapi } from './outils-strapi.mjs'

test.use({ testIdAttribute: 'data-cy' })

test.beforeEach(async () => {
	await reinitialiserStrapi()
})

// the same job at the same company, a season each: the dates and the
// description alone tell the two rows apart
const SAISON = annee => ({
	company: 'Studio Lumière',
	job_name: 'Maquilleuse',
	city: 'Annecy',
	date_start: `${annee}-06-01`,
	date_end: null,
	description: `Saison ${annee}`,
})

// the same training at the same school, a module each
const MODULE = (annee, sujet) => ({
	diploma: 'Formation continue',
	school: 'École Lumière',
	date_graduation: `${annee}-06-30`,
	course_description: `Module ${sujet}`,
})

// One entry per modal: its buttons, its fields, the message of its first
// field left empty, two rows with the same two names, the fields typed in
// (data-cy, field of the row, text added: `renommage` changes one of the two
// names), what the page shows of a row once saved and what the modal tells
// screen readers once it is removed.
const MODALES = [
	{
		nom: 'expériences',
		memes: 'la même entreprise et le même poste',
		champ: 'experiences',
		ouvrir: 'update-experience-button',
		bouton: 'add-experience-button',
		ajout: 'Ajouter une expérience',
		edition: 'Modifier une expérience',
		modifier: index => `experience-selected-${index}`,
		retirer: 'experience-selected',
		sauver: 'save-button-experience',
		erreur: 'error-company',
		champs: e => ({
			'company-input': e.company,
			'job-name-input': e.job_name,
			'city-input': e.city,
			'date-start-input': e.date_start,
			'date-end-input': e.date_end ?? '',
			'description-experience-input': e.description,
		}),
		lignes: [SAISON(2020), SAISON(2021)],
		repere: 'description',
		saisies: [
			['description-experience-input', 'description', ' et tournages'],
			['city-input', 'city', '-le-Vieux'],
		],
		renommage: ['company-input', 'company', ' Bis'],
		vue: [
			['experience-city', e => `à ${e.city}`],
			['experience-description', e => e.description],
		],
		annonce: e => `Expérience ${e.company} retirée`,
	},
	{
		nom: 'formations',
		memes: 'le même diplôme et la même école',
		champ: 'courses',
		ouvrir: 'update-courses-button',
		bouton: 'add-course-button',
		ajout: 'Ajouter une formation / diplôme',
		edition: 'Modifier la formation / diplôme',
		modifier: index => `course-edit-button-${index}`,
		retirer: 'course-delete-button',
		sauver: 'save-button-courses',
		erreur: 'error-diploma',
		champs: c => ({
			'diploma-input': c.diploma,
			'school-input': c.school,
			'date-graduation-input': c.date_graduation,
			'course-description-input': c.course_description,
		}),
		lignes: [MODULE(2019, 'teint'), MODULE(2021, 'coiffure')],
		repere: 'course_description',
		saisies: [
			['course-description-input', 'course_description', ' en alternance'],
			['school-input', 'school', ' de Lyon'],
		],
		renommage: ['diploma-input', 'diploma', ' bis'],
		vue: [
			['course-school', c => c.school],
			['course-description', c => c.course_description],
		],
		annonce: c => `Formation ${c.diploma} retirée`,
	},
]

// every field of the form, empty
const vide = modale => Object.fromEntries(Object.keys(modale.champs(modale.lignes[0])).map(cy => [cy, '']))

// the two rows, added one after the other in the modal: no Strapi id yet
async function ajouterLesDeux(page, modale) {
	await page.getByTestId(modale.ouvrir).click()
	for (const [index, ligne] of modale.lignes.entries()) {
		await remplir(page, modale.champs(ligne))
		await page.getByTestId(modale.bouton).click()
		await expect(dialogue(page).getByTestId(modale.retirer)).toHaveCount(index + 1)
	}
}

// Typed key by key at the end of a field, after the modal changed state: the
// field keeps the focus and every character. Returns the row as typed.
async function taper(page, ligne, [cy, cle, texte]) {
	const champ = dialogue(page).getByTestId(cy)
	await champ.focus()
	await champ.press('End')
	await champ.pressSequentially(texte)
	await expect(champ, cy).toBeFocused()
	await expect(champ, cy).toHaveValue(ligne[cle] + texte)
	return { ...ligne, [cle]: ligne[cle] + texte }
}

// saved: the PATCH holds these rows and nothing else (no id), the profile
// of the API and the page too
async function enregistrees(page, modale, patchs, lignes) {
	await sauver(page, modale.sauver)
	expect(patchs).toEqual([{ [modale.champ]: lignes }])
	const stockees = (await profilServeur())[modale.champ]
	expect(stockees).toHaveLength(lignes.length)
	expect(stockees).toMatchObject(lignes)
	for (const [cy, texte] of modale.vue) {
		await expect(page.getByTestId(cy), cy).toHaveText(lignes.map(texte))
	}
}

test.describe('lignes des modales expériences et formations', () => {
	for (const modale of MODALES) {
		const [premiere, seconde] = modale.lignes

		test(`${modale.nom} : deux lignes ajoutées avec ${modale.memes}, la 2e retirée : la 1re reste, seule dans la liste et dans le PATCH`, async ({
			page,
		}) => {
			const erreurs = erreursDeLaPage(page)
			const patchs = corpsDesPatchs(page)
			await profilDeDepart({ [modale.champ]: [] })
			await ouvrirProfil(page)
			await ajouterLesDeux(page, modale)
			const listees = dialogue(page).getByTestId(modale.retirer)

			await listees.nth(1).click()
			await expect(listees).toHaveCount(1)
			await expect(dialogue(page)).toContainText(premiere[modale.repere])
			await expect(dialogue(page)).not.toContainText(seconde[modale.repere])
			await enregistrees(page, modale, patchs, [premiere])
			expect(erreurs).toEqual([])
		})

		test(`${modale.nom} : deux lignes ajoutées avec ${modale.memes}, la 2e modifiée : le formulaire reçoit ses valeurs et elle seule change, dans la modale et dans le PATCH`, async ({
			page,
		}) => {
			const erreurs = erreursDeLaPage(page)
			const patchs = corpsDesPatchs(page)
			await profilDeDepart({ [modale.champ]: [] })
			await ouvrirProfil(page)
			await ajouterLesDeux(page, modale)
			const bouton = page.getByTestId(modale.bouton)

			await page.getByTestId(modale.modifier(1)).click()
			await expect(bouton).toHaveText(modale.edition)
			await valeursDeLaModale(page, modale.champs(seconde))
			const modifiee = await taper(page, seconde, modale.saisies[1])
			await bouton.click()
			await expect(bouton).toHaveText(modale.ajout)

			// each row opened again: the first as added, the second as typed
			await expect(dialogue(page).getByTestId(modale.retirer)).toHaveCount(2)
			for (const [index, ligne] of [premiere, modifiee].entries()) {
				await page.getByTestId(modale.modifier(index)).click()
				await valeursDeLaModale(page, modale.champs(ligne))
			}
			await enregistrees(page, modale, patchs, [premiere, modifiee])
			expect(erreurs).toEqual([])
		})

		test(`${modale.nom} : la ligne en cours de modification retirée de la liste : le formulaire garde la saisie et repasse en ajout, son bouton l’ajoute comme nouvelle ligne`, async ({
			page,
		}) => {
			const erreurs = erreursDeLaPage(page)
			const patchs = corpsDesPatchs(page)
			// stored by the API: the row has its Strapi id
			await profilDeDepart({ [modale.champ]: [premiere] })
			await ouvrirProfil(page)
			await page.getByTestId(modale.ouvrir).click()
			const bouton = page.getByTestId(modale.bouton)
			const listees = dialogue(page).getByTestId(modale.retirer)

			await page.getByTestId(modale.modifier(0)).click()
			await expect(bouton).toHaveText(modale.edition)
			await valeursDeLaModale(page, modale.champs(premiere))
			let saisie = await taper(page, premiere, modale.saisies[0])

			// removed while it is edited: the list is empty, nothing typed is lost
			await listees.click()
			await expect(listees).toHaveCount(0)
			await expect(bouton).toHaveText(modale.ajout)
			await valeursDeLaModale(page, modale.champs(saisie))
			saisie = await taper(page, saisie, modale.saisies[1])

			// the button adds what the form holds, then the form is empty again
			await bouton.click()
			await expect(listees).toHaveCount(1)
			await expect(dialogue(page)).toContainText(saisie[modale.repere])
			await expect(bouton).toHaveText(modale.ajout)
			await valeursDeLaModale(page, vide(modale))
			await enregistrees(page, modale, patchs, [saisie])
			expect(erreurs).toEqual([])
		})

		test(`${modale.nom} : la ligne en cours de modification retirée sans rien y avoir saisi : le formulaire est vidé et repasse en ajout, son bouton ne la remet pas`, async ({
			page,
		}) => {
			const erreurs = erreursDeLaPage(page)
			const patchs = corpsDesPatchs(page)
			await profilDeDepart({ [modale.champ]: [premiere] })
			await ouvrirProfil(page)
			await page.getByTestId(modale.ouvrir).click()
			const bouton = page.getByTestId(modale.bouton)
			const listees = dialogue(page).getByTestId(modale.retirer)

			await page.getByTestId(modale.modifier(0)).click()
			await expect(bouton).toHaveText(modale.edition)
			await valeursDeLaModale(page, modale.champs(premiere))

			// nothing typed over the row: no copy of it is left in the form
			await listees.click()
			await expect(listees).toHaveCount(0)
			await expect(bouton).toHaveText(modale.ajout)
			await valeursDeLaModale(page, vide(modale))

			// a reflex click on the button: a message, the row does not come back
			await bouton.click()
			await expect(dialogue(page).getByTestId(modale.erreur)).toBeVisible()
			await expect(listees).toHaveCount(0)
			await enregistrees(page, modale, patchs, [])
			expect(erreurs).toEqual([])
		})

		// an id built from the two names stayed on the row once renamed: a row
		// added later with the old names took the same one
		test(`${modale.nom} : une ligne ajoutée puis renommée, une autre ajoutée avec ses anciens noms, la 2e retirée : la 1re reste, seule dans la liste et dans le PATCH`, async ({
			page,
		}) => {
			const erreurs = erreursDeLaPage(page)
			const patchs = corpsDesPatchs(page)
			await profilDeDepart({ [modale.champ]: [] })
			await ouvrirProfil(page)
			await page.getByTestId(modale.ouvrir).click()
			const bouton = page.getByTestId(modale.bouton)
			const listees = dialogue(page).getByTestId(modale.retirer)

			await remplir(page, modale.champs(premiere))
			await bouton.click()
			await expect(listees).toHaveCount(1)
			await page.getByTestId(modale.modifier(0)).click()
			await expect(bouton).toHaveText(modale.edition)
			const renommee = await taper(page, premiere, modale.renommage)
			await bouton.click()
			await expect(bouton).toHaveText(modale.ajout)

			// a new row with the names the first one had when it was added
			await remplir(page, modale.champs(seconde))
			await bouton.click()
			await expect(listees).toHaveCount(2)
			await listees.nth(1).click()
			await expect(listees).toHaveCount(1)
			await expect(dialogue(page)).toContainText(renommee[modale.repere])
			await enregistrees(page, modale, patchs, [renommee])
			expect(erreurs).toEqual([])
		})

		// the last row leaves with its node: the focus fell on <body>
		test(`${modale.nom} : la dernière de deux lignes retirée au clavier : le focus passe au « Retirer » de la ligne du dessus`, async ({
			page,
		}) => {
			const erreurs = erreursDeLaPage(page)
			await profilDeDepart({ [modale.champ]: [premiere, seconde] })
			await ouvrirProfil(page)
			await page.getByTestId(modale.ouvrir).click()
			const listees = dialogue(page).getByTestId(modale.retirer)
			await expect(listees).toHaveCount(2)

			await listees.nth(1).focus()
			await page.keyboard.press('Enter')
			await expect(listees).toHaveCount(1)
			await expect(listees).toBeFocused()
			await expect(dialogue(page)).toContainText(premiere[modale.repere])
			expect(erreurs).toEqual([])
		})

		// from <body> the next Tab reached « Sauvegarder », past the text kept
		// in the form
		test(`${modale.nom} : la seule ligne, en cours de modification, retirée au clavier : le focus passe au bouton du formulaire, Entrée ajoute la saisie`, async ({
			page,
		}) => {
			const erreurs = erreursDeLaPage(page)
			await profilDeDepart({ [modale.champ]: [premiere] })
			await ouvrirProfil(page)
			await page.getByTestId(modale.ouvrir).click()
			const bouton = page.getByTestId(modale.bouton)
			const listees = dialogue(page).getByTestId(modale.retirer)

			await page.getByTestId(modale.modifier(0)).click()
			await expect(bouton).toHaveText(modale.edition)
			const saisie = await taper(page, premiere, modale.saisies[0])
			await listees.focus()
			await page.keyboard.press('Enter')
			await expect(listees).toHaveCount(0)
			await expect(bouton).toBeFocused()
			await expect(bouton).toHaveText(modale.ajout)
			await valeursDeLaModale(page, modale.champs(saisie))

			await page.keyboard.press('Enter')
			await expect(listees).toHaveCount(1)
			await expect(dialogue(page)).toContainText(saisie[modale.repere])
			await valeursDeLaModale(page, vide(modale))
			expect(erreurs).toEqual([])
		})

		// the row below takes the node of a removed one, « Retirer » and focus
		// included: Enter held, the key repeats and the browser clicks again
		// each time, so the rows left one after the other
		test(`${modale.nom} : Entrée maintenue sur « Retirer » de la 1re de deux lignes : une seule part, la 2e reste avec le focus sur son « Retirer »`, async ({
			page,
		}) => {
			const erreurs = erreursDeLaPage(page)
			const patchs = corpsDesPatchs(page)
			await profilDeDepart({ [modale.champ]: [premiere, seconde] })
			await ouvrirProfil(page)
			await page.getByTestId(modale.ouvrir).click()
			const listees = dialogue(page).getByTestId(modale.retirer)
			await expect(listees).toHaveCount(2)

			await listees.first().focus()
			await page.keyboard.down('Enter')
			await expect(listees).toHaveCount(1)
			await expect(listees).toBeFocused()
			// pressed again without being released: the browser marks it repeated
			await page.keyboard.down('Enter')
			await page.keyboard.down('Enter')
			await page.keyboard.up('Enter')
			await expect(listees).toHaveCount(1)
			await expect(listees).toBeFocused()
			await expect(dialogue(page)).toContainText(seconde[modale.repere])
			await enregistrees(page, modale, patchs, [seconde])
			expect(erreurs).toEqual([])
		})

		// after the only row the focus is on the button of the form: the
		// repeated key clicked it, and what the form held was added
		test(`${modale.nom} : Entrée maintenue sur « Retirer » de la seule ligne, en cours de modification : le bouton du formulaire prend le focus sans rien ajouter, la saisie continue dans le formulaire`, async ({
			page,
		}) => {
			const erreurs = erreursDeLaPage(page)
			const patchs = corpsDesPatchs(page)
			await profilDeDepart({ [modale.champ]: [premiere] })
			await ouvrirProfil(page)
			await page.getByTestId(modale.ouvrir).click()
			const bouton = page.getByTestId(modale.bouton)
			const listees = dialogue(page).getByTestId(modale.retirer)

			await page.getByTestId(modale.modifier(0)).click()
			await expect(bouton).toHaveText(modale.edition)
			let saisie = await taper(page, premiere, modale.saisies[0])
			await listees.focus()
			await page.keyboard.down('Enter')
			await expect(listees).toHaveCount(0)
			await expect(bouton).toBeFocused()
			await expect(bouton).toHaveText(modale.ajout)
			await page.keyboard.down('Enter')
			await page.keyboard.up('Enter')

			// typed after the key is released: the form still holds every field
			saisie = await taper(page, saisie, modale.saisies[1])
			await expect(listees).toHaveCount(0)
			await valeursDeLaModale(page, modale.champs(saisie))
			await expect(dialogue(page).getByTestId(modale.erreur)).toBeHidden()

			// a first Enter on the button adds as before
			await bouton.focus()
			await page.keyboard.press('Enter')
			await expect(listees).toHaveCount(1)
			await valeursDeLaModale(page, vide(modale))
			await enregistrees(page, modale, patchs, [saisie])
			expect(erreurs).toEqual([])
		})

		// The « Retirer » of a removed row goes to the row below with the focus,
		// under a new name that some screen readers do not read again: each
		// removal is said in the polite region of the modal. The two rows have
		// the same name, so the same sentence is said twice in a row.
		test(`${modale.nom} : deux lignes du même nom retirées, l’une à la souris, l’autre au clavier : la zone d’annonce, présente et vide à l’ouverture, dit chaque retrait`, async ({
			page,
		}) => {
			const erreurs = erreursDeLaPage(page)
			await profilDeDepart({ [modale.champ]: [premiere, seconde] })
			await ouvrirProfil(page)
			await page.getByTestId(modale.ouvrir).click()
			const listees = dialogue(page).getByTestId(modale.retirer)
			await expect(listees).toHaveCount(2)
			// there before anything is said (a region that comes with its text is
			// not read), polite, and out of sight
			const zone = zoneAnnonce(page)
			await expect(zone).toHaveText('')
			await expect(zone).toHaveAttribute('aria-live', 'polite')
			await expect(zone).toHaveClass(/(^| )sr-only( |$)/)
			const dites = await annoncesDites(page)

			await listees.first().click()
			await expect(listees).toHaveCount(1)
			await expect(zone).toHaveText(modale.annonce(premiere))
			await listees.focus()
			await page.keyboard.press('Enter')
			await expect(listees).toHaveCount(0)
			await expect(zone).toHaveText(modale.annonce(seconde))
			// the same words twice: put in the region again, or nothing is read
			expect(modale.annonce(seconde)).toBe(modale.annonce(premiere))
			expect(await dites()).toEqual([modale.annonce(premiere), modale.annonce(seconde)])
			expect(erreurs).toEqual([])
		})
	}
})
