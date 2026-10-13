// What #966 left out of the rows of the modals. « Modifier » and « Retirer »
// find an offer by its id: an offer added in the services modal took an id
// built from its name and its price, so two offers with the same ones were
// removed and overwritten together; and removing the offer loaded in the
// form left the form in edit mode, where its button updated nothing and
// emptied the fields. Removed with the keyboard, the last language, skill or
// offer of its list took the focus out of the modal with it, and the last
// offer left the tabs with no offer shown. A language or a skill added in its
// modal took its name as id: two chips with the same name left together.
// Left empty, the list of offers kept a Tab stop that showed nothing.
// From the review of #968: with the focus kept in the modal, Enter held on a
// button clicked it again each time the key repeated.
import { expect, test } from '@playwright/test'
import { corpsDesPatchs, dialogue, erreursDeLaPage, sauver, valeursDeLaModale } from './espace-helpers.mjs'
import { ouvrirProfil, profilDeDepart, profilServeur, reinitialiserStrapi } from './outils-strapi.mjs'

test.use({ testIdAttribute: 'data-cy' })

test.beforeEach(async () => {
	await reinitialiserStrapi()
})

// The services modal: its buttons, the message of its first field left empty.
const MODALE = {
	ouvrir: 'update-service-offers-button',
	option: 'add-service-offers-option-button',
	bouton: 'add-service-offers-button',
	ajout: 'Ajouter une prestation',
	edition: 'Modifier une prestation',
	modifier: index => `edit-service-offers-button-${index}`,
	retirer: 'delete-service-offers-button',
	sauver: 'save-button-service-offers',
	fermer: 'close-modal',
	erreur: 'error-name',
}

// the same service at the same price, a formula each: the description and
// the options alone tell the two offers apart
const FORMULE = (description, options = []) => ({
	name: 'Maquillage mariée',
	price: '120 €',
	description,
	options,
})
const OFFRES = [
	FORMULE('Essai et jour J', [{ name: 'Déplacement', price: '20 €', description: 'Jusqu’à 30 km' }]),
	FORMULE('Jour J seulement'),
]

// two prices, for the offer and for its option: stored one per line, shown
// in the form on one line with « ; » between them
const DEUX_PRIX = {
	name: 'Maquillage soirée',
	price: '60 €\n90 € avec coiffure',
	description: 'À domicile',
	options: [{ name: 'Faux cils', price: '10 €\n15 € en bouquets', description: 'Pose comprise' }],
}

// three offers told apart by their name, for the keyboard
const TROIS = ['A', 'B', 'C'].map(lettre => ({
	name: `Offre ${lettre}`,
	price: '50 €',
	description: `Description ${lettre}`,
	options: [],
}))
const [offreA, offreB, offreC] = TROIS

// the form left empty, without any option
const SANS_OFFRE = { name: '', price: '', description: '', options: [] }

// prices as the form shows and takes them
const enSaisie = prix => prix.replaceAll('\n', ';')

// the fields of the form for an offer: its own, then those of each option
const champs = offre => ({
	'name-service-offers-input': offre.name,
	'description-service-offers-input': offre.description,
	'price-service-offers-input': enSaisie(offre.price),
	...Object.fromEntries(
		offre.options.flatMap((option, i) => [
			[`name-service-offers-option-input-${i}`, option.name],
			[`description-service-offers-option-input-${i}`, option.description],
			[`price-service-offers-option-input-${i}`, enSaisie(option.price)],
		])
	),
})

// the form holds this offer and its options, and no other option
async function formulaire(page, offre) {
	await valeursDeLaModale(page, champs(offre))
	await expect(dialogue(page).getByTestId(/^name-service-offers-option-input-/)).toHaveCount(offre.options.length)
}

// one tab per offer of the list; the offer shown is the only panel rendered
const onglets = page => dialogue(page).getByRole('tab')
const affichee = page => dialogue(page).getByRole('tabpanel')

// Typed key by key at the end of a field, after the modal changed state: the
// field keeps the focus and every character. Returns the text it holds.
async function taper(page, cy, avant, texte) {
	const champ = dialogue(page).getByTestId(cy)
	await champ.focus()
	await champ.press('End')
	await champ.pressSequentially(texte)
	await expect(champ, cy).toBeFocused()
	await expect(champ, cy).toHaveValue(avant + texte)
	return avant + texte
}

// an offer typed in the form, its options too, and added to the list: no
// Strapi id yet
async function ajouter(page, offre) {
	for (let i = 0; i < offre.options.length; i++) {
		await page.getByTestId(MODALE.option).click()
	}
	for (const [cy, valeur] of Object.entries(champs(offre))) {
		await taper(page, cy, '', valeur)
	}
	await page.getByTestId(MODALE.bouton).click()
}

// the two offers with the same name and price, added one after the other,
// then the second one shown, with its « Modifier » and its « Retirer »
async function ajouterLesDeux(page) {
	await page.getByTestId(MODALE.ouvrir).click()
	for (const [index, offre] of OFFRES.entries()) {
		await ajouter(page, offre)
		await expect(onglets(page)).toHaveCount(index + 1)
	}
	await onglets(page).nth(1).click()
	await expect(affichee(page)).toContainText(OFFRES[1].description)
}

// saved: the PATCH holds these offers with their options and nothing else
// (no id), the profile of the API and the page too
async function enregistrees(page, patchs, offres) {
	await sauver(page, MODALE.sauver)
	expect(patchs).toEqual([{ service_offers: offres }])
	const stockees = (await profilServeur()).service_offers
	expect(stockees).toHaveLength(offres.length)
	expect(stockees).toMatchObject(offres)
	await expect(page.getByTestId('service-offer-name')).toHaveText(offres.map(offre => offre.name))
	await expect(page.getByTestId('service-offer-description')).toHaveText(offres.map(offre => offre.description))
}

test.describe('lignes de la modale prestations', () => {
	const [premiere, seconde] = OFFRES

	test('prestations : deux offres ajoutées avec le même nom et le même prix, la 2e retirée : la 1re reste, seule dans la liste et dans le PATCH', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		await profilDeDepart({ service_offers: [] })
		await ouvrirProfil(page)
		await ajouterLesDeux(page)

		await page.getByTestId(MODALE.retirer).click()
		await expect(onglets(page)).toHaveCount(1)
		// the offer above is shown in its place
		await expect(affichee(page)).toContainText(premiere.description)
		await expect(affichee(page)).not.toContainText(seconde.description)
		await enregistrees(page, patchs, [premiere])
		expect(erreurs).toEqual([])
	})

	test('prestations : deux offres ajoutées avec le même nom et le même prix, la 2e modifiée : le formulaire reçoit ses valeurs et elle seule change, dans la modale et dans le PATCH', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		await profilDeDepart({ service_offers: [] })
		await ouvrirProfil(page)
		await ajouterLesDeux(page)
		const bouton = page.getByTestId(MODALE.bouton)

		await page.getByTestId(MODALE.modifier(1)).click()
		await expect(bouton).toHaveText(MODALE.edition)
		await formulaire(page, seconde)
		const modifiee = {
			...seconde,
			description: await taper(page, 'description-service-offers-input', seconde.description, ', sans essai'),
		}
		await bouton.click()
		await expect(bouton).toHaveText(MODALE.ajout)

		// each offer opened again: the first as added, the second as typed
		await expect(onglets(page)).toHaveCount(2)
		for (const [index, offre] of [premiere, modifiee].entries()) {
			await onglets(page).nth(index).click()
			await expect(affichee(page)).toContainText(offre.description)
			await page.getByTestId(MODALE.modifier(index)).click()
			await formulaire(page, offre)
		}
		await enregistrees(page, patchs, [premiere, modifiee])
		expect(erreurs).toEqual([])
	})

	test('prestations : l’offre en cours de modification retirée de la liste : le formulaire garde la saisie et repasse en ajout, son bouton l’ajoute comme nouvelle offre', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		// stored by the API: the offer and its option have their Strapi id
		await profilDeDepart({ service_offers: [DEUX_PRIX] })
		await ouvrirProfil(page)
		await page.getByTestId(MODALE.ouvrir).click()
		const bouton = page.getByTestId(MODALE.bouton)

		await page.getByTestId(MODALE.modifier(0)).click()
		await expect(bouton).toHaveText(MODALE.edition)
		await formulaire(page, DEUX_PRIX)
		// typed in an option only: the options count as typed text too
		const [option] = DEUX_PRIX.options
		let saisie = {
			...DEUX_PRIX,
			options: [{ ...option, name: await taper(page, 'name-service-offers-option-input-0', option.name, ' naturels') }],
		}

		// removed while it is edited: the list is empty, nothing typed is lost
		await page.getByTestId(MODALE.retirer).click()
		await expect(onglets(page)).toHaveCount(0)
		await expect(bouton).toHaveText(MODALE.ajout)
		await formulaire(page, saisie)
		// the option is edited in place again: its field keeps the focus too
		saisie = {
			...saisie,
			options: [
				{
					...saisie.options[0],
					description: await taper(page, 'description-service-offers-option-input-0', option.description, ' et dépose'),
				},
			],
		}

		// the button adds what the form holds, then the form is empty again
		await bouton.click()
		await expect(onglets(page)).toHaveText([saisie.name])
		await expect(affichee(page)).toContainText(saisie.description)
		await expect(affichee(page)).toContainText(saisie.options[0].name)
		await expect(bouton).toHaveText(MODALE.ajout)
		await formulaire(page, SANS_OFFRE)
		await enregistrees(page, patchs, [saisie])
		expect(erreurs).toEqual([])
	})

	test('prestations : l’offre en cours de modification retirée sans rien y avoir saisi : le formulaire est vidé et repasse en ajout, son bouton ne la remet pas', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		await profilDeDepart({ service_offers: [DEUX_PRIX] })
		await ouvrirProfil(page)
		await page.getByTestId(MODALE.ouvrir).click()
		const bouton = page.getByTestId(MODALE.bouton)

		await page.getByTestId(MODALE.modifier(0)).click()
		await expect(bouton).toHaveText(MODALE.edition)
		await formulaire(page, DEUX_PRIX)

		// nothing typed over the offer: no copy of it is left in the form
		await page.getByTestId(MODALE.retirer).click()
		await expect(onglets(page)).toHaveCount(0)
		await expect(bouton).toHaveText(MODALE.ajout)
		await formulaire(page, SANS_OFFRE)

		// a reflex click on the button: a message, the offer does not come back
		await bouton.click()
		await expect(dialogue(page).getByTestId(MODALE.erreur)).toBeVisible()
		await expect(onglets(page)).toHaveCount(0)
		await enregistrees(page, patchs, [])
		expect(erreurs).toEqual([])
	})

	// an id built from the name and the price stayed on the offer once
	// renamed: an offer added later with the old name took the same one
	test('prestations : une offre ajoutée puis renommée, une autre ajoutée avec son ancien nom et le même prix, la 2e retirée : la 1re reste, seule dans la liste et dans le PATCH', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		await profilDeDepart({ service_offers: [] })
		await ouvrirProfil(page)
		await page.getByTestId(MODALE.ouvrir).click()
		const bouton = page.getByTestId(MODALE.bouton)

		await ajouter(page, premiere)
		await expect(onglets(page)).toHaveCount(1)
		await page.getByTestId(MODALE.modifier(0)).click()
		await expect(bouton).toHaveText(MODALE.edition)
		const renommee = {
			...premiere,
			name: await taper(page, 'name-service-offers-input', premiere.name, ' bis'),
		}
		await bouton.click()
		await expect(bouton).toHaveText(MODALE.ajout)
		await expect(onglets(page)).toHaveText([renommee.name])

		// a new offer with the name the first one had when it was added
		await ajouter(page, seconde)
		await expect(onglets(page)).toHaveCount(2)
		await onglets(page).nth(1).click()
		await expect(affichee(page)).toContainText(seconde.description)
		await page.getByTestId(MODALE.retirer).click()
		await expect(onglets(page)).toHaveText([renommee.name])
		await expect(affichee(page)).toContainText(renommee.description)
		await enregistrees(page, patchs, [renommee])
		expect(erreurs).toEqual([])
	})

	// the offer below takes the tab, the panel and the « Retirer » of a
	// removed one; the last offer left with them: the focus fell on <body>
	// and no offer was shown
	test('prestations : une offre du milieu puis la dernière retirées au clavier : le focus reste sur « Retirer » pour l’offre qui prend la place, puis passe au « Retirer » de l’offre du dessus, affichée', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		await profilDeDepart({ service_offers: TROIS })
		await ouvrirProfil(page)
		await page.getByTestId(MODALE.ouvrir).click()
		const retirer = page.getByTestId(MODALE.retirer)
		await expect(onglets(page)).toHaveText(['Offre A', 'Offre B', 'Offre C'])

		// the second offer reached from the first tab
		await onglets(page).first().focus()
		await page.keyboard.press('ArrowRight')
		await expect(onglets(page).nth(1)).toHaveAttribute('aria-selected', 'true')
		await retirer.focus()
		await page.keyboard.press('Enter')
		await expect(onglets(page)).toHaveText(['Offre A', 'Offre C'])
		await expect(retirer).toBeFocused()
		await expect(retirer).toHaveAccessibleName('Retirer la prestation Offre C')
		await expect(affichee(page)).toContainText('Description C')

		// the last of the list: the offer above is shown, its « Retirer » focused
		await page.keyboard.press('Enter')
		await expect(onglets(page)).toHaveText(['Offre A'])
		await expect(onglets(page)).toHaveAttribute('aria-selected', 'true')
		await expect(retirer).toBeFocused()
		await expect(retirer).toHaveAccessibleName('Retirer la prestation Offre A')
		await expect(affichee(page)).toContainText('Description A')
		expect(erreurs).toEqual([])
	})

	// from <body> the next Tab went past the text kept in the form
	test('prestations : la seule offre, en cours de modification, retirée au clavier : le focus passe au bouton du formulaire, Tab mène à « Sauvegarder », Entrée ajoute la saisie', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		await profilDeDepart({ service_offers: [DEUX_PRIX] })
		await ouvrirProfil(page)
		await page.getByTestId(MODALE.ouvrir).click()
		const bouton = page.getByTestId(MODALE.bouton)
		const retirer = page.getByTestId(MODALE.retirer)

		await page.getByTestId(MODALE.modifier(0)).click()
		await expect(bouton).toHaveText(MODALE.edition)
		const saisie = {
			...DEUX_PRIX,
			description: await taper(page, 'description-service-offers-input', DEUX_PRIX.description, ' ou au studio'),
		}
		await retirer.focus()
		await page.keyboard.press('Enter')
		await expect(onglets(page)).toHaveCount(0)
		await expect(bouton).toBeFocused()
		await expect(bouton).toHaveText(MODALE.ajout)
		await formulaire(page, saisie)

		// the empty list holds no Tab stop: without a tab, Headless UI rendered
		// a focusable button that shows nothing, before « Sauvegarder »
		await page.keyboard.press('Tab')
		await expect(page.getByTestId(MODALE.sauver)).toBeFocused()
		await page.keyboard.press('Shift+Tab')
		await expect(bouton).toBeFocused()

		await page.keyboard.press('Enter')
		await expect(onglets(page)).toHaveText([saisie.name])
		await expect(affichee(page)).toContainText(saisie.description)
		await formulaire(page, SANS_OFFRE)
		expect(erreurs).toEqual([])
	})

	// The only path where the list is rendered at once (flushSync) while the
	// form leaves edit mode. One field typed, the others as loaded: each one
	// alone is typed text to keep.
	for (const { quoi, cy, ajout, saisi } of [
		{ quoi: 'nom', cy: 'name-service-offers-input', ajout: ' bis', saisi: { name: 'Offre C bis' } },
		{ quoi: 'prix', cy: 'price-service-offers-input', ajout: ';80 € en duo', saisi: { price: '50 €\n80 € en duo' } },
	]) {
		test(`prestations : la dernière offre, son ${quoi} modifié dans le formulaire, retirée au clavier : l’offre du dessus est affichée et son « Retirer » prend le focus, le formulaire garde la saisie et repasse en ajout`, async ({
			page,
		}) => {
			const erreurs = erreursDeLaPage(page)
			const patchs = corpsDesPatchs(page)
			await profilDeDepart({ service_offers: TROIS })
			await ouvrirProfil(page)
			await page.getByTestId(MODALE.ouvrir).click()
			const bouton = page.getByTestId(MODALE.bouton)
			const retirer = page.getByTestId(MODALE.retirer)

			await onglets(page).nth(2).click()
			await expect(affichee(page)).toContainText(offreC.description)
			await page.getByTestId(MODALE.modifier(2)).click()
			await expect(bouton).toHaveText(MODALE.edition)
			await formulaire(page, offreC)
			await taper(page, cy, champs(offreC)[cy], ajout)
			const saisie = { ...offreC, ...saisi }
			await formulaire(page, saisie)

			await retirer.focus()
			await page.keyboard.press('Enter')
			await expect(onglets(page)).toHaveText([offreA.name, offreB.name])
			await expect(onglets(page).nth(1)).toHaveAttribute('aria-selected', 'true')
			await expect(affichee(page)).toContainText(offreB.description)
			await expect(retirer).toBeFocused()
			await expect(retirer).toHaveAccessibleName(`Retirer la prestation ${offreB.name}`)
			await expect(bouton).toHaveText(MODALE.ajout)
			await formulaire(page, saisie)

			// the button adds what the form holds, after the two offers left
			await bouton.click()
			await expect(onglets(page)).toHaveText([offreA.name, offreB.name, saisie.name])
			await formulaire(page, SANS_OFFRE)
			await enregistrees(page, patchs, [offreA, offreB, saisie])
			expect(erreurs).toEqual([])
		})
	}

	test('prestations : la dernière offre, en cours de modification sans rien y avoir saisi, retirée avec Espace : l’offre du dessus est affichée et son « Retirer » prend le focus, le formulaire est vidé', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		await profilDeDepart({ service_offers: TROIS })
		await ouvrirProfil(page)
		await page.getByTestId(MODALE.ouvrir).click()
		const bouton = page.getByTestId(MODALE.bouton)
		const retirer = page.getByTestId(MODALE.retirer)

		await onglets(page).nth(2).click()
		await expect(affichee(page)).toContainText(offreC.description)
		await page.getByTestId(MODALE.modifier(2)).click()
		await expect(bouton).toHaveText(MODALE.edition)
		await formulaire(page, offreC)

		await retirer.focus()
		await page.keyboard.press('Space')
		await expect(onglets(page)).toHaveText([offreA.name, offreB.name])
		await expect(onglets(page).nth(1)).toHaveAttribute('aria-selected', 'true')
		await expect(affichee(page)).toContainText(offreB.description)
		await expect(retirer).toBeFocused()
		await expect(retirer).toHaveAccessibleName(`Retirer la prestation ${offreB.name}`)
		await expect(bouton).toHaveText(MODALE.ajout)
		await formulaire(page, SANS_OFFRE)
		await enregistrees(page, patchs, [offreA, offreB])
		expect(erreurs).toEqual([])
	})

	test('prestations : la première de trois offres retirée au clavier : l’offre suivante est affichée à sa place, le focus reste sur « Retirer »', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		await profilDeDepart({ service_offers: TROIS })
		await ouvrirProfil(page)
		await page.getByTestId(MODALE.ouvrir).click()
		const retirer = page.getByTestId(MODALE.retirer)
		await expect(onglets(page)).toHaveText(TROIS.map(offre => offre.name))

		await retirer.focus()
		await page.keyboard.press('Enter')
		await expect(onglets(page)).toHaveText([offreB.name, offreC.name])
		await expect(onglets(page).first()).toHaveAttribute('aria-selected', 'true')
		await expect(affichee(page)).toContainText(offreB.description)
		await expect(retirer).toBeFocused()
		await expect(retirer).toHaveAccessibleName(`Retirer la prestation ${offreB.name}`)
		await enregistrees(page, patchs, [offreB, offreC])
		expect(erreurs).toEqual([])
	})

	// A removal keeps the focus in the modal, on the « Retirer » of the offer
	// that took the panel: Enter held, the key repeats and the browser clicks
	// again each time, so the offers left one after the other
	test('prestations : Entrée maintenue sur « Retirer » de la 1re de trois offres : une seule part ; relâchée puis pressée de nouveau, la suivante part', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		await profilDeDepart({ service_offers: TROIS })
		await ouvrirProfil(page)
		await page.getByTestId(MODALE.ouvrir).click()
		const retirer = page.getByTestId(MODALE.retirer)
		await expect(onglets(page)).toHaveText(TROIS.map(offre => offre.name))

		await retirer.focus()
		await page.keyboard.down('Enter')
		await expect(onglets(page)).toHaveText([offreB.name, offreC.name])
		await expect(retirer).toBeFocused()
		// pressed again without being released: the browser marks it repeated
		await page.keyboard.down('Enter')
		await page.keyboard.down('Enter')
		await page.keyboard.up('Enter')
		await expect(onglets(page)).toHaveText([offreB.name, offreC.name])
		await expect(retirer).toBeFocused()
		await expect(retirer).toHaveAccessibleName(`Retirer la prestation ${offreB.name}`)

		// released then pressed: a first Enter removes as before
		await page.keyboard.press('Enter')
		await expect(onglets(page)).toHaveText([offreC.name])
		await expect(retirer).toBeFocused()
		await enregistrees(page, patchs, [offreC])
		expect(erreurs).toEqual([])
	})

	// after the only offer the focus is on the button of the form: the
	// repeated key clicked it, and what the form held was added
	test('prestations : Entrée maintenue sur « Retirer » de la seule offre, en cours de modification : le bouton du formulaire prend le focus sans rien ajouter, la saisie continue dans le formulaire', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		await profilDeDepart({ service_offers: [DEUX_PRIX] })
		await ouvrirProfil(page)
		await page.getByTestId(MODALE.ouvrir).click()
		const bouton = page.getByTestId(MODALE.bouton)
		const retirer = page.getByTestId(MODALE.retirer)

		await page.getByTestId(MODALE.modifier(0)).click()
		await expect(bouton).toHaveText(MODALE.edition)
		let saisie = {
			...DEUX_PRIX,
			description: await taper(page, 'description-service-offers-input', DEUX_PRIX.description, ' ou au studio'),
		}
		await retirer.focus()
		await page.keyboard.down('Enter')
		await expect(onglets(page)).toHaveCount(0)
		await expect(bouton).toBeFocused()
		await expect(bouton).toHaveText(MODALE.ajout)
		await page.keyboard.down('Enter')
		await page.keyboard.up('Enter')

		// typed after the key is released: the form still holds every field
		saisie = { ...saisie, name: await taper(page, 'name-service-offers-input', saisie.name, ' bis') }
		await expect(onglets(page)).toHaveCount(0)
		await formulaire(page, saisie)
		await expect(dialogue(page).getByTestId(MODALE.erreur)).toBeHidden()

		// a first Enter on the button adds as before
		await bouton.focus()
		await page.keyboard.press('Enter')
		await expect(onglets(page)).toHaveText([saisie.name])
		await formulaire(page, SANS_OFFRE)
		await enregistrees(page, patchs, [saisie])
		expect(erreurs).toEqual([])
	})

	// every button of the modal, not « Retirer » alone: the form has no way to
	// take an option back
	test('prestations : Entrée maintenue sur « Ajouter une option à la prestation » : une seule option s’ajoute ; relâchée puis pressée de nouveau, une 2e', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		await profilDeDepart({ service_offers: [] })
		await ouvrirProfil(page)
		await page.getByTestId(MODALE.ouvrir).click()
		const options = dialogue(page).getByTestId(/^name-service-offers-option-input-/)

		await page.getByTestId(MODALE.option).focus()
		await page.keyboard.down('Enter')
		await expect(options).toHaveCount(1)
		await page.keyboard.down('Enter')
		await page.keyboard.down('Enter')
		await page.keyboard.up('Enter')
		await expect(options).toHaveCount(1)
		await page.keyboard.press('Enter')
		await expect(options).toHaveCount(2)
		expect(erreurs).toEqual([])
	})

	// The options of the offer shown (and its tabs) act on keydown by
	// themselves, without a click of the browser: an option opened, then
	// closed and opened again each time the key repeated
	test('prestations : Entrée maintenue sur une option de l’offre affichée : elle s’ouvre et reste ouverte ; relâchée puis pressée de nouveau, elle se referme', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		await profilDeDepart({ service_offers: [DEUX_PRIX] })
		await ouvrirProfil(page)
		await page.getByTestId(MODALE.ouvrir).click()
		const option = dialogue(page).getByTestId('service-offer-name-0')
		await expect(option).toHaveAttribute('aria-expanded', 'false')

		await option.focus()
		await page.keyboard.down('Enter')
		await expect(option).toHaveAttribute('aria-expanded', 'true')
		// repeated once: a second repeat would open it again
		await page.keyboard.down('Enter')
		await page.keyboard.up('Enter')
		await expect(option).toHaveAttribute('aria-expanded', 'true')
		await expect(dialogue(page).getByTestId('service-offer-description-0')).toBeVisible()
		await page.keyboard.press('Enter')
		await expect(option).toHaveAttribute('aria-expanded', 'false')
		expect(erreurs).toEqual([])
	})

	// Enter held on the button of the page that opens the modal: « Fermer »
	// has the focus by the time the key repeats, and closed it at once
	test('prestations : Entrée maintenue sur le bouton qui ouvre la modale : « Fermer » prend le focus et la modale reste ouverte ; relâchée puis pressée de nouveau, elle se ferme', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		await profilDeDepart({ service_offers: TROIS })
		await ouvrirProfil(page)
		const fermer = page.getByTestId(MODALE.fermer)

		await page.getByTestId(MODALE.ouvrir).focus()
		await page.keyboard.down('Enter')
		await expect(onglets(page)).toHaveText(TROIS.map(offre => offre.name))
		await expect(fermer).toBeFocused()
		await page.keyboard.down('Enter')
		await page.keyboard.up('Enter')
		await expect(dialogue(page)).toBeVisible()
		await expect(fermer).toBeFocused()

		// a first Enter on « Fermer » closes as before
		await page.keyboard.press('Enter')
		await expect(dialogue(page)).toBeHidden()
		expect(erreurs).toEqual([])
	})

	// the list holds the offer shown, and leaves with the dialog
	test('prestations : la modale fermée sur la 3e offre puis rouverte : la 1re offre est affichée', async ({ page }) => {
		const erreurs = erreursDeLaPage(page)
		await profilDeDepart({ service_offers: TROIS })
		await ouvrirProfil(page)
		await page.getByTestId(MODALE.ouvrir).click()
		await onglets(page).nth(2).click()
		await expect(affichee(page)).toContainText(offreC.description)

		await page.getByTestId(MODALE.fermer).click()
		await expect(dialogue(page)).toBeHidden()
		await page.getByTestId(MODALE.ouvrir).click()
		await expect(onglets(page)).toHaveText(TROIS.map(offre => offre.name))
		await expect(onglets(page).first()).toHaveAttribute('aria-selected', 'true')
		await expect(affichee(page)).toContainText(offreA.description)
		expect(erreurs).toEqual([])
	})

	// the ids do not follow the positions: the form still points at its offer
	test('prestations : une offre en cours de modification, celle d’avant puis celle d’après retirées : « Modifier » met à jour la bonne offre, seule dans la liste et dans le PATCH', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		await profilDeDepart({ service_offers: TROIS })
		await ouvrirProfil(page)
		await page.getByTestId(MODALE.ouvrir).click()
		const bouton = page.getByTestId(MODALE.bouton)
		const retirer = page.getByTestId(MODALE.retirer)

		await onglets(page).nth(1).click()
		await expect(affichee(page)).toContainText(offreB.description)
		await page.getByTestId(MODALE.modifier(1)).click()
		await expect(bouton).toHaveText(MODALE.edition)
		await formulaire(page, offreB)

		// the offer before it, then the one after it
		await onglets(page).first().click()
		await expect(affichee(page)).toContainText(offreA.description)
		await retirer.click()
		await expect(onglets(page)).toHaveText([offreB.name, offreC.name])
		await onglets(page).nth(1).click()
		await expect(affichee(page)).toContainText(offreC.description)
		await retirer.click()
		await expect(onglets(page)).toHaveText([offreB.name])
		await expect(affichee(page)).toContainText(offreB.description)
		await expect(bouton).toHaveText(MODALE.edition)
		await formulaire(page, offreB)

		const modifiee = {
			...offreB,
			name: await taper(page, 'name-service-offers-input', offreB.name, ' bis'),
		}
		await bouton.click()
		await expect(bouton).toHaveText(MODALE.ajout)
		await expect(onglets(page)).toHaveText([modifiee.name])
		await enregistrees(page, patchs, [modifiee])
		expect(erreurs).toEqual([])
	})
})

// One entry per list of chips: a chip is its own « Retirer », found by its
// id. Its field and the message under it, its three names stored by the API
// and one typed in the modal.
const PUCES = [
	{
		nom: 'langues',
		champ: 'language',
		ouvrir: 'update-languages-button',
		saisie: 'language-input',
		erreur: 'error-language',
		puce: 'language-selected',
		sauver: 'save-button-languages',
		noms: ['Français', 'Anglais', 'Italien'],
		nouvelle: 'Espagnol',
	},
	{
		nom: 'compétences',
		champ: 'skills',
		ouvrir: 'update-skills-button',
		saisie: 'skills-input',
		erreur: 'error-skills',
		puce: 'skill-selected',
		sauver: 'save-button-skills',
		noms: ['Mariée', 'Cinéma', 'Effets spéciaux'],
		nouvelle: 'Théâtre',
	},
]

test.describe('puces des modales langues et compétences', () => {
	for (const liste of PUCES) {
		const [premiere, deuxieme, troisieme] = liste.noms
		const puce = (page, nom) => dialogue(page).getByRole('button', { name: `Retirer ${nom}`, exact: true })

		// the chip below takes the node of a removed one; the last chip left
		// with its node: the focus fell on <body>
		test(`${liste.nom} : une puce du milieu puis la dernière retirées au clavier : le focus reste sur la puce qui prend la place, puis passe à la puce du dessus`, async ({
			page,
		}) => {
			const erreurs = erreursDeLaPage(page)
			const patchs = corpsDesPatchs(page)
			await profilDeDepart({ [liste.champ]: liste.noms.map(name => ({ name })) })
			await ouvrirProfil(page)
			await page.getByTestId(liste.ouvrir).click()
			const puces = dialogue(page).getByTestId(liste.puce)
			await expect(puces).toHaveCount(3)

			await puces.nth(1).focus()
			await page.keyboard.press('Enter')
			await expect(puces).toHaveCount(2)
			await expect(puce(page, troisieme)).toBeFocused()

			await page.keyboard.press('Enter')
			await expect(puces).toHaveCount(1)
			await expect(puce(page, premiere)).toBeFocused()
			await sauver(page, liste.sauver)
			expect(patchs).toEqual([{ [liste.champ]: [{ name: premiere }] }])
			expect(erreurs).toEqual([])
		})

		// the name of a chip was its id: the first one left with the second,
		// and the focus with them
		test(`${liste.nom} : quatre puces du même nom ajoutées, deux par Entrée puis deux par « ; », les trois dernières retirées une à une au clavier : la puce du dessus prend le focus, la 1re reste seule dans le PATCH`, async ({
			page,
		}) => {
			const erreurs = erreursDeLaPage(page)
			const patchs = corpsDesPatchs(page)
			await profilDeDepart({ [liste.champ]: [] })
			await ouvrirProfil(page)
			await page.getByTestId(liste.ouvrir).click()
			const puces = dialogue(page).getByTestId(liste.puce)
			const champ = dialogue(page).getByTestId(liste.saisie)
			await expect(puces).toHaveCount(0)

			// a pair by each way of adding: neither may share an id
			const touches = ['Enter', 'Enter', ';', ';']
			for (const [index, touche] of touches.entries()) {
				await champ.pressSequentially(liste.nouvelle)
				await expect(champ).toBeFocused()
				await expect(champ).toHaveValue(liste.nouvelle)
				await champ.press(touche)
				await expect(puces).toHaveCount(index + 1)
				await expect(champ).toHaveValue('')
			}

			await puces.last().focus()
			for (let reste = touches.length - 1; reste >= 1; reste--) {
				await page.keyboard.press('Enter')
				await expect(puces).toHaveCount(reste)
				await expect(puces.last()).toBeFocused()
			}
			await sauver(page, liste.sauver)
			expect(patchs).toEqual([{ [liste.champ]: [{ name: liste.nouvelle }] }])
			expect((await profilServeur())[liste.champ].map(element => element.name)).toEqual([liste.nouvelle])
			expect(erreurs).toEqual([])
		})

		// the field is where the next one is typed: Enter there adds it, when
		// on « Sauvegarder » it would have saved the empty list
		test(`${liste.nom} : la seule puce retirée au clavier : le focus passe au champ de saisie, ce qui y est tapé ensuite y arrive en entier et s’ajoute`, async ({
			page,
		}) => {
			const erreurs = erreursDeLaPage(page)
			const patchs = corpsDesPatchs(page)
			await profilDeDepart({ [liste.champ]: [{ name: premiere }] })
			await ouvrirProfil(page)
			await page.getByTestId(liste.ouvrir).click()
			const puces = dialogue(page).getByTestId(liste.puce)
			const champ = dialogue(page).getByTestId(liste.saisie)
			await expect(puces).toHaveCount(1)

			await puces.focus()
			await page.keyboard.press('Enter')
			await expect(puces).toHaveCount(0)
			await expect(champ).toBeFocused()

			await champ.pressSequentially(liste.nouvelle)
			await expect(champ).toBeFocused()
			await expect(champ).toHaveValue(liste.nouvelle)
			await page.keyboard.press('Enter')
			await expect(puce(page, liste.nouvelle)).toBeVisible()
			await expect(champ).toBeFocused()
			await expect(champ).toHaveValue('')
			await sauver(page, liste.sauver)
			expect(patchs).toEqual([{ [liste.champ]: [{ name: liste.nouvelle }] }])
			expect((await profilServeur())[liste.champ].map(element => element.name)).toEqual([liste.nouvelle])
			expect(erreurs).toEqual([])
		})

		// the chip below takes the node and the focus of a removed one: Enter
		// held, the key repeats on it and the chips left one after the other
		test(`${liste.nom} : Entrée maintenue sur la 1re de trois puces : une seule part ; relâchée puis pressée de nouveau, la suivante part`, async ({
			page,
		}) => {
			const erreurs = erreursDeLaPage(page)
			const patchs = corpsDesPatchs(page)
			await profilDeDepart({ [liste.champ]: liste.noms.map(name => ({ name })) })
			await ouvrirProfil(page)
			await page.getByTestId(liste.ouvrir).click()
			const puces = dialogue(page).getByTestId(liste.puce)
			await expect(puces).toHaveCount(3)

			await puces.first().focus()
			await page.keyboard.down('Enter')
			await expect(puces).toHaveCount(2)
			await expect(puce(page, deuxieme)).toBeFocused()
			// pressed again without being released: the browser marks it repeated
			await page.keyboard.down('Enter')
			await page.keyboard.down('Enter')
			await page.keyboard.up('Enter')
			await expect(puces).toHaveCount(2)
			await expect(puce(page, deuxieme)).toBeFocused()

			// released then pressed: a first Enter removes as before
			await page.keyboard.press('Enter')
			await expect(puces).toHaveCount(1)
			await expect(puce(page, troisieme)).toBeFocused()
			await sauver(page, liste.sauver)
			expect(patchs).toEqual([{ [liste.champ]: [{ name: troisieme }] }])
			expect(erreurs).toEqual([])
		})

		// Enter held on the chip: the key repeats in the field, which has the
		// focus by then. Nothing was typed there: no message, and the only PATCH
		// is the one of « Sauvegarder ».
		test(`${liste.nom} : Entrée maintenue sur la seule puce : la touche se répète dans le champ de saisie sans y afficher d’erreur`, async ({
			page,
		}) => {
			const erreurs = erreursDeLaPage(page)
			const patchs = corpsDesPatchs(page)
			await profilDeDepart({ [liste.champ]: [{ name: premiere }] })
			await ouvrirProfil(page)
			await page.getByTestId(liste.ouvrir).click()
			const puces = dialogue(page).getByTestId(liste.puce)
			const champ = dialogue(page).getByTestId(liste.saisie)
			await expect(puces).toHaveCount(1)

			await puces.focus()
			await page.keyboard.down('Enter')
			await expect(puces).toHaveCount(0)
			await expect(champ).toBeFocused()
			// pressed again without being released: the browser marks it repeated
			await page.keyboard.down('Enter')
			await page.keyboard.up('Enter')
			await expect(champ).toBeFocused()
			await expect(champ).toHaveValue('')
			await expect(dialogue(page).getByTestId(liste.erreur)).toBeHidden()
			await sauver(page, liste.sauver)
			expect(patchs).toEqual([{ [liste.champ]: [] }])
			expect(erreurs).toEqual([])
		})

		// A stored chip has its index as id, an added one a local id: the same
		// name does not tie them. And the field takes the focus for the keyboard
		// only: on a phone, a tap on the only chip would open the virtual keyboard.
		test(`${liste.nom} : une puce stockée et une puce ajoutée du même nom, retirées l’une après l’autre à la souris : une seule part à chaque clic, puis le champ de saisie ne prend pas le focus`, async ({
			page,
		}) => {
			const erreurs = erreursDeLaPage(page)
			const patchs = corpsDesPatchs(page)
			await profilDeDepart({ [liste.champ]: [{ name: premiere }] })
			await ouvrirProfil(page)
			await page.getByTestId(liste.ouvrir).click()
			const puces = dialogue(page).getByTestId(liste.puce)
			const champ = dialogue(page).getByTestId(liste.saisie)
			await expect(puces).toHaveCount(1)

			await champ.pressSequentially(premiere)
			await expect(champ).toBeFocused()
			await expect(champ).toHaveValue(premiere)
			await champ.press('Enter')
			await expect(puce(page, premiere)).toHaveCount(2)
			await expect(champ).toHaveValue('')

			await puces.first().click()
			await expect(puce(page, premiere)).toHaveCount(1)
			await puces.click()
			await expect(puces).toHaveCount(0)
			await expect(champ).not.toBeFocused()
			await sauver(page, liste.sauver)
			expect(patchs).toEqual([{ [liste.champ]: [] }])
			expect((await profilServeur())[liste.champ]).toEqual([])
			expect(erreurs).toEqual([])
		})
	}
})
