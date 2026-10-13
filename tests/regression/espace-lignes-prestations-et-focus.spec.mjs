// What #966 left out of the rows of the modals. « Modifier » and « Retirer »
// find an offer by its id: an offer added in the services modal took an id
// built from its name and its price, so two offers with the same ones were
// removed and overwritten together; and removing the offer loaded in the
// form left the form in edit mode, where its button updated nothing and
// emptied the fields. Removed with the keyboard, the last language, skill or
// offer of its list took the focus out of the modal with it, and the last
// offer left the tabs with no offer shown. A language or a skill added in its
// modal took its name as id: two chips with the same name left together.
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
		let saisie = {
			...DEUX_PRIX,
			description: await taper(page, 'description-service-offers-input', DEUX_PRIX.description, ' ou au studio'),
		}

		// removed while it is edited: the list is empty, nothing typed is lost
		await page.getByTestId(MODALE.retirer).click()
		await expect(onglets(page)).toHaveCount(0)
		await expect(bouton).toHaveText(MODALE.ajout)
		await formulaire(page, saisie)
		// an option is edited in place: its field keeps the focus too
		const [option] = saisie.options
		saisie = {
			...saisie,
			options: [{ ...option, name: await taper(page, 'name-service-offers-option-input-0', option.name, ' naturels') }],
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
	test('prestations : la seule offre, en cours de modification, retirée au clavier : le focus passe au bouton du formulaire, Entrée ajoute la saisie', async ({
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

		await page.keyboard.press('Enter')
		await expect(onglets(page)).toHaveText([saisie.name])
		await expect(affichee(page)).toContainText(saisie.description)
		await formulaire(page, SANS_OFFRE)
		expect(erreurs).toEqual([])
	})
})

// One entry per list of chips: a chip is its own « Retirer », found by its
// id. Its field, its three names stored by the API and one typed in the modal.
const PUCES = [
	{
		nom: 'langues',
		champ: 'language',
		ouvrir: 'update-languages-button',
		saisie: 'language-input',
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
		puce: 'skill-selected',
		sauver: 'save-button-skills',
		noms: ['Mariée', 'Cinéma', 'Effets spéciaux'],
		nouvelle: 'Théâtre',
	},
]

test.describe('puces des modales langues et compétences', () => {
	for (const liste of PUCES) {
		const [premiere, , troisieme] = liste.noms
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
		test(`${liste.nom} : deux puces du même nom ajoutées, par Entrée puis par « ; », la 2e retirée au clavier : la 1re reste et prend le focus, seule dans le PATCH`, async ({
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

			for (const [index, touche] of ['Enter', ';'].entries()) {
				await champ.pressSequentially(liste.nouvelle)
				await expect(champ).toBeFocused()
				await expect(champ).toHaveValue(liste.nouvelle)
				await champ.press(touche)
				await expect(puces).toHaveCount(index + 1)
				await expect(champ).toHaveValue('')
			}

			await puces.nth(1).focus()
			await page.keyboard.press('Enter')
			await expect(puces).toHaveCount(1)
			await expect(puces).toBeFocused()
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
	}
})
