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
// button clicked it again each time the key repeated; a language or a skill
// already in its list was added a second time; an offer with several prices
// or an option too, and the offers the modal did refuse were refused without
// a word, the one validated unchanged among them; the « Retirer » focused
// took the name of the next item without a word for screen readers.
import { expect, test } from '@playwright/test'
import {
	annoncesDites,
	corpsDesPatchs,
	dialogue,
	erreursDeLaPage,
	sauver,
	valeursDeLaModale,
	zoneAnnonce,
} from './espace-helpers.mjs'
import { ouvrirProfil, profilDeDepart, profilServeur, reinitialiserStrapi } from './outils-strapi.mjs'

test.use({ testIdAttribute: 'data-cy' })

test.beforeEach(async () => {
	await reinitialiserStrapi()
})

// The services modal: its buttons, the message of its first field left empty
// and the one of a form refused as a copy of a listed offer.
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
	doublon: 'error-duplicate',
	identique: 'Une prestation identique est déjà dans la liste.',
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
		await expect(fermer).toBeFocused()
		// a modal on its way out is still visible, « Fermer » still focused:
		// only an open one lets another offer be shown
		await onglets(page).nth(1).click()
		await expect(affichee(page)).toContainText(offreB.description)

		// a first Enter on « Fermer » closes as before
		await fermer.focus()
		await page.keyboard.press('Enter')
		await expect(dialogue(page)).toBeHidden()
		expect(erreurs).toEqual([])
	})

	// « Fermer » and « Sauvegarder » close the modal, and the focus goes back
	// to the button of the page that opened it: the key repeated there, and
	// the modal opened again
	for (const { libelle, cy, envoyes } of [
		{ libelle: 'Fermer', cy: MODALE.fermer, envoyes: [] },
		{ libelle: 'Sauvegarder', cy: MODALE.sauver, envoyes: [{ service_offers: TROIS }] },
	]) {
		test(`prestations : Entrée maintenue sur « ${libelle} » : la modale se ferme et reste fermée, le bouton qui l’ouvre a le focus ; relâchée puis pressée de nouveau, elle s’ouvre`, async ({
			page,
		}) => {
			const erreurs = erreursDeLaPage(page)
			const patchs = corpsDesPatchs(page)
			await profilDeDepart({ service_offers: TROIS })
			await ouvrirProfil(page)
			const ouvrir = page.getByTestId(MODALE.ouvrir)
			await ouvrir.click()
			await expect(onglets(page)).toHaveText(TROIS.map(offre => offre.name))

			await page.getByTestId(cy).focus()
			await page.keyboard.down('Enter')
			await expect(ouvrir).toBeFocused()
			// repeated once: a second repeat could find the button of the page
			// again, and close what the first one opened
			await page.keyboard.down('Enter')
			await page.keyboard.up('Enter')
			await expect(dialogue(page)).toBeHidden()
			await expect(ouvrir).toBeFocused()
			expect(patchs).toEqual(envoyes)

			// a first Enter on the button of the page opens as before: another
			// offer is shown, which a modal on its way out does not allow
			await page.keyboard.press('Enter')
			await onglets(page).nth(1).click()
			await expect(affichee(page)).toContainText(offreB.description)
			expect(patchs).toEqual(envoyes)
			expect(erreurs).toEqual([])
		})
	}

	// Identical: the same name, prices and description, and the same options
	// in the same order (name, prices and description of each); never the ids.
	// The price was compared as stored, one per line, with the price as typed,
	// « ; » between them, and an option typed by hand has no stored id: this
	// offer was added a second time. And a refusal showed nothing.
	test('prestations : une offre à deux prix et une option saisie une 2e fois à l’identique : refusée avec un message, la saisie reste ; un prix de l’option complété, le message part et elle s’ajoute', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		await profilDeDepart({ service_offers: [DEUX_PRIX] })
		await ouvrirProfil(page)
		await page.getByTestId(MODALE.ouvrir).click()
		const bouton = page.getByTestId(MODALE.bouton)
		const doublon = dialogue(page).getByTestId(MODALE.doublon)
		await expect(onglets(page)).toHaveCount(1)

		await ajouter(page, DEUX_PRIX)
		await expect(doublon).toHaveText(MODALE.identique)
		await expect(doublon).toHaveRole('alert')
		await expect(onglets(page)).toHaveCount(1)
		await expect(bouton).toHaveText(MODALE.ajout)
		await formulaire(page, DEUX_PRIX)

		// a third price for the option: no longer a copy
		const [option] = DEUX_PRIX.options
		await taper(page, 'price-service-offers-option-input-0', enSaisie(option.price), ';20 € en volume russe')
		const autre = { ...DEUX_PRIX, options: [{ ...option, price: `${option.price}\n20 € en volume russe` }] }
		await expect(doublon).toHaveCount(0)
		await bouton.click()
		await expect(onglets(page)).toHaveCount(2)
		await formulaire(page, SANS_OFFRE)
		await enregistrees(page, patchs, [DEUX_PRIX, autre])
		expect(erreurs).toEqual([])
	})

	test('prestations : une offre modifiée jusqu’à être la copie d’une autre : refusée avec un message, elle reste en cours de modification ; son nom complété, elle est modifiée', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		await profilDeDepart({ service_offers: TROIS })
		await ouvrirProfil(page)
		await page.getByTestId(MODALE.ouvrir).click()
		const bouton = page.getByTestId(MODALE.bouton)
		const doublon = dialogue(page).getByTestId(MODALE.doublon)

		await onglets(page).nth(1).click()
		await expect(affichee(page)).toContainText(offreB.description)
		await page.getByTestId(MODALE.modifier(1)).click()
		await expect(bouton).toHaveText(MODALE.edition)
		await formulaire(page, offreB)
		// the last letter of its name and of its description: those of offer A
		for (const cy of ['name-service-offers-input', 'description-service-offers-input']) {
			const champ = dialogue(page).getByTestId(cy)
			await champ.focus()
			await champ.press('End')
			await champ.press('Backspace')
			await champ.pressSequentially('A')
			await expect(champ, cy).toBeFocused()
			await expect(champ, cy).toHaveValue(champs(offreA)[cy])
		}

		await bouton.click()
		await expect(doublon).toHaveText(MODALE.identique)
		await expect(bouton).toHaveText(MODALE.edition)
		await expect(onglets(page)).toHaveText(TROIS.map(offre => offre.name))
		await formulaire(page, offreA)

		const modifiee = { ...offreA, name: await taper(page, 'name-service-offers-input', offreA.name, ' bis') }
		await expect(doublon).toHaveCount(0)
		await bouton.click()
		await expect(bouton).toHaveText(MODALE.ajout)
		await expect(onglets(page)).toHaveText([offreA.name, modifiee.name, offreC.name])
		await formulaire(page, SANS_OFFRE)
		await enregistrees(page, patchs, [offreA, modifiee, offreC])
		expect(erreurs).toEqual([])
	})

	// Loaded by « Modifier » and left as it is, an offer is not a copy of
	// itself. With one price and no option it was taken for one: the button
	// did nothing and the form stayed in edit mode. The twin of an offer
	// stored twice (old data) is not refused either: nothing changes.
	test('prestations : chaque offre chargée par « Modifier » puis validée sans rien changer, deux d’entre elles stockées à l’identique : aucun message, le formulaire repasse en ajout, la liste et le PATCH restent les mêmes', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const patchs = corpsDesPatchs(page)
		const offres = [DEUX_PRIX, offreA, offreA]
		await profilDeDepart({ service_offers: offres })
		await ouvrirProfil(page)
		await page.getByTestId(MODALE.ouvrir).click()
		const bouton = page.getByTestId(MODALE.bouton)

		for (const [index, offre] of offres.entries()) {
			await onglets(page).nth(index).click()
			await expect(onglets(page).nth(index)).toHaveAttribute('aria-selected', 'true')
			await page.getByTestId(MODALE.modifier(index)).click()
			await expect(bouton).toHaveText(MODALE.edition)
			await formulaire(page, offre)
			await bouton.click()
			await expect(bouton, `offre ${index + 1}`).toHaveText(MODALE.ajout)
			await formulaire(page, SANS_OFFRE)
			await expect(dialogue(page).getByTestId(MODALE.doublon)).toHaveCount(0)
			await expect(onglets(page)).toHaveText(offres.map(o => o.name))
		}
		await enregistrees(page, patchs, offres)
		expect(erreurs).toEqual([])
	})

	// The description and the prices of the offer shown in the modal had no
	// rank to be named after: their data-cy ended with « undefined ». The rank
	// alone would not do: it already names the options of the offer
	// (service-offer-description-0), in the modal and on the page behind it.
	test('prestations : la description et les prix de l’offre affichée dans la modale portent son rang dans leur data-cy, un seul élément chacun dans toute la page, ses options gardent le leur', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		const offres = [DEUX_PRIX, offreA]
		await profilDeDepart({ service_offers: offres })
		await ouvrirProfil(page)
		await page.getByTestId(MODALE.ouvrir).click()
		await expect(onglets(page)).toHaveText(offres.map(offre => offre.name))

		for (const [index, offre] of offres.entries()) {
			await onglets(page).nth(index).click()
			await expect(onglets(page).nth(index)).toHaveAttribute('aria-selected', 'true')
			// looked for in the whole page: a second element with the same data-cy,
			// in the modal or behind it, fails the assertion (strict mode)
			await expect(page.getByTestId(`service-offer-description-modal-${index}`)).toHaveText(offre.description)
			await expect(page.getByTestId(`service-offer-price-modal-${index}`).getByRole('heading')).toHaveText(
				offre.price.split('\n')
			)
			// each of its options, named after its own rank as on the page
			await expect(dialogue(page).getByTestId(/^service-offer-description-\d+$/)).toHaveText(
				offre.options.map(option => option.description)
			)
		}
		await expect(page.locator('[data-cy$="undefined"]')).toHaveCount(0)
		expect(erreurs).toEqual([])
	})

	// The « Retirer » of a removed offer goes to the offer below with the
	// focus, under a new name that some screen readers do not read again:
	// each removal is said in the polite region of the modal.
	test('prestations : une offre retirée à la souris, la suivante au clavier, puis la modale fermée et rouverte : la zone d’annonce, présente et vide à l’ouverture, dit chaque retrait et revient vide', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		await profilDeDepart({ service_offers: TROIS })
		await ouvrirProfil(page)
		await page.getByTestId(MODALE.ouvrir).click()
		const retirer = page.getByTestId(MODALE.retirer)
		await expect(onglets(page)).toHaveText(TROIS.map(offre => offre.name))
		// there before anything is said (a region that comes with its text is
		// not read), polite, and out of sight
		const zone = zoneAnnonce(page)
		await expect(zone).toHaveText('')
		await expect(zone).toHaveAttribute('aria-live', 'polite')
		await expect(zone).toHaveClass(/(^| )sr-only( |$)/)
		const dites = await annoncesDites(page)

		await retirer.click()
		await expect(onglets(page)).toHaveText([offreB.name, offreC.name])
		await expect(zone).toHaveText(`Prestation ${offreA.name} retirée`)
		await retirer.focus()
		await page.keyboard.press('Enter')
		await expect(onglets(page)).toHaveText([offreC.name])
		await expect(retirer).toHaveAccessibleName(`Retirer la prestation ${offreC.name}`)
		await expect(zone).toHaveText(`Prestation ${offreB.name} retirée`)
		expect(await dites()).toEqual([`Prestation ${offreA.name} retirée`, `Prestation ${offreB.name} retirée`])

		// closed without saving, opened again: nothing left to read in the region
		await page.keyboard.press('Escape')
		await expect(dialogue(page)).toBeHidden()
		await page.getByTestId(MODALE.ouvrir).click()
		await expect(onglets(page)).toHaveText(TROIS.map(offre => offre.name))
		await expect(zone).toHaveText('')
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
// id. Its field and the message under it, its three names stored by the API,
// one typed in the modal, the message of a name already in the list and
// what the modal tells screen readers once a chip is removed.
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
		doublon: 'Cette langue est déjà dans la liste.',
		annonce: nom => `Langue ${nom} retirée`,
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
		doublon: 'Cette compétence est déjà dans la liste.',
		annonce: nom => `Compétence ${nom} retirée`,
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

		// Old data: a name stored several times, when the modal still added it
		// twice. Each chip has its index as id: they stay shown, are saved as
		// they are and leave one at a time, the focus going to the chip above.
		test(`${liste.nom} : un nom stocké quatre fois (anciennes données), enregistré tel quel, puis les trois dernières puces retirées une à une au clavier : la puce du dessus prend le focus, la 1re reste seule dans le PATCH`, async ({
			page,
		}) => {
			const erreurs = erreursDeLaPage(page)
			const patchs = corpsDesPatchs(page)
			const quatre = Array.from({ length: 4 }, () => ({ name: liste.nouvelle }))
			await profilDeDepart({ [liste.champ]: quatre })
			await ouvrirProfil(page)
			await page.getByTestId(liste.ouvrir).click()
			const puces = dialogue(page).getByTestId(liste.puce)
			await expect(puce(page, liste.nouvelle)).toHaveCount(4)

			// saved untouched: nothing is merged when the modal opens nor when it saves
			await sauver(page, liste.sauver)
			expect(patchs).toEqual([{ [liste.champ]: quatre }])
			expect((await profilServeur())[liste.champ].map(element => element.name)).toEqual(
				quatre.map(element => element.name)
			)

			await page.getByTestId(liste.ouvrir).click()
			await expect(puce(page, liste.nouvelle)).toHaveCount(4)
			await puces.last().focus()
			for (let reste = quatre.length - 1; reste >= 1; reste--) {
				await page.keyboard.press('Enter')
				await expect(puces).toHaveCount(reste)
				await expect(puces.last()).toBeFocused()
			}
			await sauver(page, liste.sauver)
			expect(patchs[1]).toEqual({ [liste.champ]: [{ name: liste.nouvelle }] })
			expect(patchs).toHaveLength(2)
			expect((await profilServeur())[liste.champ].map(element => element.name)).toEqual([liste.nouvelle])
			expect(erreurs).toEqual([])
		})

		// Compared without the spaces around it nor the case: « anglais » and
		// « Anglais » are one language. Each way of adding a chip refuses it and
		// says why, where the name stays to be corrected.
		test(`${liste.nom} : un nom déjà dans la liste, tapé avec une autre casse et des espaces, refusé par Entrée, par « ; » tapé puis par « ; » collé : le message est sous le champ et lu avec lui, la saisie reste ; complétée, elle s’ajoute`, async ({
			page,
		}) => {
			const erreurs = erreursDeLaPage(page)
			const patchs = corpsDesPatchs(page)
			await profilDeDepart({ [liste.champ]: [premiere, deuxieme].map(name => ({ name })) })
			await ouvrirProfil(page)
			await page.getByTestId(liste.ouvrir).click()
			const puces = dialogue(page).getByTestId(liste.puce)
			const champ = dialogue(page).getByTestId(liste.saisie)
			const erreur = dialogue(page).getByTestId(liste.erreur)
			await expect(puces).toHaveCount(2)

			// refused: no chip more, the message under the field and read with it
			const refuse = async valeur => {
				await expect(erreur).toHaveText(liste.doublon)
				await expect(champ).toHaveAttribute('aria-invalid', 'true')
				await expect(champ).toHaveAccessibleDescription(liste.doublon)
				await expect(champ).toBeFocused()
				await expect(champ).toHaveValue(valeur)
				await expect(puces).toHaveCount(2)
			}

			// Enter, the name in capitals with spaces around it
			const majuscules = ` ${premiere.toUpperCase()} `
			await champ.pressSequentially(majuscules)
			await expect(champ).toBeFocused()
			await expect(champ).toHaveValue(majuscules)
			await champ.press('Enter')
			await refuse(majuscules)

			// « ; » typed after it: the name stays, without its separator
			await champ.press(';')
			await refuse(majuscules.trim())

			// pasted with its separator in one go, on a fresh field
			const minuscules = deuxieme.toLowerCase()
			await champ.fill('')
			await champ.fill(`${minuscules};`)
			await refuse(minuscules)

			// completed: the message goes, Enter adds the name
			await champ.press('End')
			await champ.pressSequentially(' bis')
			await expect(champ).toBeFocused()
			await expect(champ).toHaveValue(`${minuscules} bis`)
			await expect(erreur).toHaveCount(0)
			await expect(champ).toHaveAttribute('aria-invalid', 'false')
			await champ.press('Enter')
			await expect(puce(page, `${minuscules} bis`)).toBeVisible()
			await expect(champ).toHaveValue('')
			await sauver(page, liste.sauver)
			expect(patchs).toEqual([{ [liste.champ]: [premiere, deuxieme, `${minuscules} bis`].map(name => ({ name })) }])
			expect(erreurs).toEqual([])
		})

		// The message is true as long as the name is in the list. It stayed
		// under the field, still marked invalid, once the chip that held the
		// name was removed to make room for it. The name is stored twice here
		// (old data): it is free when the second chip is gone, not before.
		test(`${liste.nom} : un nom refusé comme déjà dans la liste, stocké deux fois, puis ses deux puces retirées, à la souris puis au clavier : le message reste tant qu’il en reste une, part avec la dernière, et Entrée ajoute le nom`, async ({
			page,
		}) => {
			const erreurs = erreursDeLaPage(page)
			const patchs = corpsDesPatchs(page)
			await profilDeDepart({ [liste.champ]: [premiere, deuxieme, deuxieme].map(name => ({ name })) })
			await ouvrirProfil(page)
			await page.getByTestId(liste.ouvrir).click()
			const puces = dialogue(page).getByTestId(liste.puce)
			const champ = dialogue(page).getByTestId(liste.saisie)
			const erreur = dialogue(page).getByTestId(liste.erreur)
			await expect(puces).toHaveCount(3)

			const minuscules = deuxieme.toLowerCase()
			await champ.pressSequentially(minuscules)
			await expect(champ).toBeFocused()
			await expect(champ).toHaveValue(minuscules)
			await champ.press('Enter')
			await expect(erreur).toHaveText(liste.doublon)
			await expect(champ).toHaveAttribute('aria-invalid', 'true')

			// one of the two chips of that name: the other still holds it
			await puce(page, deuxieme).first().click()
			await expect(puces).toHaveCount(2)
			await expect(erreur).toHaveText(liste.doublon)
			await expect(champ).toHaveAttribute('aria-invalid', 'true')
			await expect(champ).toHaveAccessibleDescription(liste.doublon)

			// the last one: the name is free, nothing says otherwise any more
			await puce(page, deuxieme).focus()
			await page.keyboard.press('Enter')
			await expect(puces).toHaveCount(1)
			await expect(erreur).toHaveCount(0)
			await expect(champ).toHaveAttribute('aria-invalid', 'false')
			await expect(champ).toHaveAccessibleDescription('')
			await expect(champ).toHaveValue(minuscules)

			await champ.focus()
			await champ.press('Enter')
			await expect(puce(page, minuscules)).toBeVisible()
			await expect(champ).toHaveValue('')
			await expect(erreur).toHaveCount(0)
			await sauver(page, liste.sauver)
			expect(patchs).toEqual([{ [liste.champ]: [premiere, minuscules].map(name => ({ name })) }])
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

		// « Sauvegarder » closes the modal and the focus goes back to the button
		// of the page that opened it: the key repeated there, and the modal
		// opened again
		test(`${liste.nom} : Entrée maintenue sur « Sauvegarder » : un seul PATCH part, la modale se ferme et reste fermée, le bouton qui l’ouvre a le focus ; relâchée puis pressée de nouveau, elle s’ouvre`, async ({
			page,
		}) => {
			const erreurs = erreursDeLaPage(page)
			const patchs = corpsDesPatchs(page)
			const stockees = liste.noms.map(name => ({ name }))
			await profilDeDepart({ [liste.champ]: stockees })
			await ouvrirProfil(page)
			const ouvrir = page.getByTestId(liste.ouvrir)
			await ouvrir.click()
			const puces = dialogue(page).getByTestId(liste.puce)
			await expect(puces).toHaveCount(3)

			await page.getByTestId(liste.sauver).focus()
			await page.keyboard.down('Enter')
			await expect(ouvrir).toBeFocused()
			// repeated once: a second repeat could find the button of the page
			// again, and close what the first one opened
			await page.keyboard.down('Enter')
			await page.keyboard.up('Enter')
			await expect(dialogue(page)).toBeHidden()
			await expect(ouvrir).toBeFocused()
			expect(patchs).toEqual([{ [liste.champ]: stockees }])

			// a first Enter on the button of the page opens as before: a chip is
			// removed, which a modal on its way out does not allow
			await page.keyboard.press('Enter')
			await puces.first().click()
			await expect(puces).toHaveCount(2)
			expect(patchs).toHaveLength(1)
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

		// The chip below takes the node and the focus of a removed one, under a
		// new name that some screen readers do not read again: each removal is
		// said in the polite region of the modal. Two chips have the same name:
		// the same sentence is said twice in a row.
		test(`${liste.nom} : deux puces du même nom puis une autre retirées, la 1re à la souris, les suivantes au clavier : la zone d’annonce, présente et vide à l’ouverture, dit chaque retrait`, async ({
			page,
		}) => {
			const erreurs = erreursDeLaPage(page)
			await profilDeDepart({ [liste.champ]: [premiere, premiere, deuxieme].map(name => ({ name })) })
			await ouvrirProfil(page)
			await page.getByTestId(liste.ouvrir).click()
			const puces = dialogue(page).getByTestId(liste.puce)
			await expect(puces).toHaveCount(3)
			// there before anything is said (a region that comes with its text is
			// not read), polite, and out of sight
			const zone = zoneAnnonce(page)
			await expect(zone).toHaveText('')
			await expect(zone).toHaveAttribute('aria-live', 'polite')
			await expect(zone).toHaveClass(/(^| )sr-only( |$)/)
			const dites = await annoncesDites(page)

			await puces.first().click()
			await expect(puces).toHaveCount(2)
			await expect(zone).toHaveText(liste.annonce(premiere))
			await puces.first().focus()
			await page.keyboard.press('Enter')
			await expect(puces).toHaveCount(1)
			await expect(puce(page, deuxieme)).toBeFocused()
			await expect(zone).toHaveText(liste.annonce(premiere))
			await page.keyboard.press('Enter')
			await expect(puces).toHaveCount(0)
			await expect(zone).toHaveText(liste.annonce(deuxieme))
			// the same words twice: put in the region again, or nothing is read
			expect(await dites()).toEqual([liste.annonce(premiere), liste.annonce(premiere), liste.annonce(deuxieme)])
			expect(erreurs).toEqual([])
		})

		// Stored chips have their index as id: the same name does not tie two of
		// them. And the field takes the focus for the keyboard only: on a phone,
		// a tap on the only chip would open the virtual keyboard.
		test(`${liste.nom} : deux puces stockées du même nom (anciennes données), retirées l’une après l’autre à la souris : une seule part à chaque clic, puis le champ de saisie ne prend pas le focus`, async ({
			page,
		}) => {
			const erreurs = erreursDeLaPage(page)
			const patchs = corpsDesPatchs(page)
			await profilDeDepart({ [liste.champ]: [{ name: premiere }, { name: premiere }] })
			await ouvrirProfil(page)
			await page.getByTestId(liste.ouvrir).click()
			const puces = dialogue(page).getByTestId(liste.puce)
			const champ = dialogue(page).getByTestId(liste.saisie)
			await expect(puce(page, premiere)).toHaveCount(2)

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
