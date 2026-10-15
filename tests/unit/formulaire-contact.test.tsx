import { expect, test } from 'bun:test'
import { type ActionDuContact, avecLEchecDuReseau, FormulaireDeContact } from '@/components/contact/FormulaireDeContact'
import type { EtatDuContact, MessageDeContact } from '@/lib/contact/message'
import { ouvrirFenetre } from '../outils/dom-react'

/** The contact form alone, in a jsdom window (tickets 158 and 160; plan 02 E51 and E69 are played in a browser by tests/e2e/contact.spec.ts). */

const fenetre = ouvrirFenetre()

const VALEURS: MessageDeContact = {
	prenom: 'Léa',
	nom: 'Témoin',
	email: 'lea.temoin@example.test',
	telephone: '01 99 00 12 34',
	message: 'Une question.',
}

type Mesure = { nom: string; proprietes: { ok: boolean; status: number } }

function monter(action: ActionDuContact) {
	const mesures: Mesure[] = []
	const suivre = (nom: 'platform_contact_submit', proprietes: { ok: boolean; status: number }) =>
		void mesures.push({ nom, proprietes })
	return { mesures, element: <FormulaireDeContact action={action} suivre={suivre} /> }
}

async function remplir(valeurs: Partial<MessageDeContact> = {}) {
	const v = { ...VALEURS, ...valeurs }
	await fenetre.saisir(fenetre.champ('Prénom'), v.prenom)
	await fenetre.saisir(fenetre.champ('Nom'), v.nom)
	await fenetre.saisir(fenetre.champ('Email'), v.email)
	await fenetre.saisir(fenetre.champ('Numéro de téléphone'), v.telephone)
	await fenetre.saisir(fenetre.champ('Message'), v.message)
}

test('les cinq champs du site en ligne, étiquetés, avec les attributs des navigateurs', async () => {
	const { element } = monter(async () => null)
	const zone = await fenetre.monter(element)

	expect(fenetre.champ('Prénom').getAttribute('autocomplete')).toBe('given-name')
	expect(fenetre.champ('Nom').getAttribute('autocomplete')).toBe('family-name')
	expect(fenetre.champ('Email').getAttribute('type')).toBe('email')
	expect(fenetre.champ('Numéro de téléphone').getAttribute('type')).toBe('tel')
	expect(fenetre.champ('Message').tagName).toBe('TEXTAREA')
	expect(zone.querySelector('form')?.hasAttribute('novalidate')).toBe(true)
	expect(zone.querySelector('a[href="/politique-de-confidentialite"]')).toBeTruthy()
})

test('un envoi réussi laisse la place à la confirmation, annoncée comme un statut', async () => {
	const { element } = monter(async () => ({ envoye: true }))
	const zone = await fenetre.monter(element)
	await remplir()

	await fenetre.cliquer(fenetre.bouton('Envoyer l’email'))

	const confirmation = await fenetre.attendre(() => zone.querySelector('[data-testid="contact-envoye"]'))
	expect(confirmation.getAttribute('role')).toBe('status')
	expect(confirmation.textContent).toBe('Le message a bien été envoyé !')
	expect(zone.querySelector('form')).toBeNull()
})

test('E51 : les erreurs sont sous leur champ, en français, et le premier champ en erreur prend le focus', async () => {
	const erreurs = { nom: 'Le nom est requis', email: 'L’e-mail est invalide' }
	const { element } = monter(async () => ({ erreurs, valeurs: { ...VALEURS, nom: '', email: 'x' } }))
	const zone = await fenetre.monter(element)

	await fenetre.cliquer(fenetre.bouton('Envoyer l’email'))
	await fenetre.attendre(() => zone.querySelector('[data-testid="erreur-nom"]')?.textContent)

	expect(zone.querySelector('[data-testid="erreur-nom"]')?.textContent).toBe('Le nom est requis')
	expect(zone.querySelector('[data-testid="erreur-email"]')?.textContent).toBe('L’e-mail est invalide')
	expect(zone.querySelector('[data-testid="erreur-prenom"]')?.textContent).toBe('')
	const nom = fenetre.champ('Nom')
	expect(nom.getAttribute('aria-invalid')).toBe('true')
	expect(nom.getAttribute('aria-describedby')).toBe('erreur-nom')
	expect(fenetre.champ('Prénom').getAttribute('aria-invalid')).toBeNull()
	// The first one in the order of the form, not the last.
	expect(fenetre.w.document.activeElement).toBe(nom)
	// The summary is announced.
	expect(zone.querySelector('[role="alert"]')?.textContent).toContain('corrigez les champs signalés')
})

test('E69 : une erreur annonce un résumé, et la saisie reste dans les champs', async () => {
	const { element } = monter(async () => ({
		erreurs: { telephone: 'Le numéro de téléphone est requis' },
		valeurs: { ...VALEURS, telephone: '' },
	}))
	const zone = await fenetre.monter(element)
	await remplir({ telephone: '' })

	await fenetre.cliquer(fenetre.bouton('Envoyer l’email'))
	await fenetre.attendre(() => zone.querySelector('[data-testid="erreur-telephone"]')?.textContent)

	expect(fenetre.champ('Prénom').value).toBe('Léa')
	expect(fenetre.champ('Email').value).toBe('lea.temoin@example.test')
	expect(fenetre.champ('Message').value).toBe('Une question.')
})

test('après un échec d’enregistrement, la saisie reste et le message le dit', async () => {
	const { element } = monter(async () => ({ echec: true, valeurs: VALEURS }))
	const zone = await fenetre.monter(element)
	await remplir()

	await fenetre.cliquer(fenetre.bouton('Envoyer l’email'))
	await fenetre.attendre(() => zone.querySelector('[role="alert"] p'))

	expect(zone.querySelector('[role="alert"]')?.textContent).toContain('Une erreur s’est produite !')
	expect(fenetre.champ('Prénom').value).toBe('Léa')
	expect(fenetre.champ('Nom').value).toBe('Témoin')
	expect(fenetre.champ('Email').value).toBe('lea.temoin@example.test')
	expect(fenetre.champ('Numéro de téléphone').value).toBe('01 99 00 12 34')
	expect(fenetre.champ('Message').value).toBe('Une question.')
	// She can send again.
	expect((fenetre.bouton('Envoyer l’email') as HTMLButtonElement).disabled).toBe(false)
})

test('une requête qui échoue en route garde la saisie et compte comme un échec sans statut', async () => {
	const { element, mesures } = monter(async () => {
		throw new Error('Failed to fetch')
	})
	const zone = await fenetre.monter(element)
	await remplir()

	await fenetre.cliquer(fenetre.bouton('Envoyer l’email'))
	await fenetre.attendre(() => zone.querySelector('[role="alert"] p'))

	expect(fenetre.champ('Message').value).toBe('Une question.')
	expect(mesures).toEqual([{ nom: 'platform_contact_submit', proprietes: { ok: false, status: 0 } }])
})

test('160 : un double clic et Entrée maintenue n’envoient qu’un message', async () => {
	let envois = 0
	let repondre: () => void = () => {}
	const { element } = monter(() => {
		envois++
		return new Promise<EtatDuContact>(fin => {
			repondre = () => fin({ envoye: true })
		})
	})
	const zone = await fenetre.monter(element)
	await remplir()
	const bouton = fenetre.bouton('Envoyer l’email')
	const form = zone.querySelector('form') as HTMLFormElement

	await fenetre.cliquer(bouton)
	await fenetre.cliquer(bouton)
	// Enter held in a field: the browser submits again and again.
	for (let i = 0; i < 5; i++) form.requestSubmit()
	await new Promise(r => setTimeout(r, 20))

	expect(envois).toBe(1)
	expect((fenetre.bouton('Envoi…') as HTMLButtonElement).disabled).toBe(true)

	repondre()
	await fenetre.attendre(() => zone.querySelector('[data-testid="contact-envoye"]'))
	expect(envois).toBe(1)
})

test('après une réponse, un nouvel envoi est possible', async () => {
	let envois = 0
	const { element } = monter(async () => {
		envois++
		return { echec: true, valeurs: VALEURS }
	})
	const zone = await fenetre.monter(element)
	await remplir()

	await fenetre.cliquer(fenetre.bouton('Envoyer l’email'))
	await fenetre.attendre(() => zone.querySelector('[role="alert"] p'))
	await fenetre.cliquer(fenetre.bouton('Envoyer l’email'))
	await fenetre.attendre(() => envois === 2)

	expect(envois).toBe(2)
})

test('l’événement de mesure part une fois par réponse, avec le résultat et jamais un texte saisi', async () => {
	const reponses: EtatDuContact[] = [
		{ erreurs: { nom: 'Le nom est requis' }, valeurs: VALEURS },
		{ echec: true, valeurs: VALEURS },
		{ envoye: true },
	]
	const { element, mesures } = monter(async () => reponses.shift() ?? null)
	const zone = await fenetre.monter(element)
	await remplir()

	expect(mesures).toEqual([])
	for (let i = 0; i < 3; i++) {
		await fenetre.cliquer(fenetre.bouton('Envoyer l’email'))
		await fenetre.attendre(() => mesures.length === i + 1 || undefined)
		// Let any other render settle: the count must not move without a new answer.
		await new Promise(r => setTimeout(r, 10))
	}
	await fenetre.attendre(() => zone.querySelector('[data-testid="contact-envoye"]'))

	expect(mesures.map(m => m.proprietes)).toEqual([
		{ ok: false, status: 400 },
		{ ok: false, status: 500 },
		{ ok: true, status: 200 },
	])
	const dit = JSON.stringify(mesures)
	for (const saisi of Object.values(VALEURS)) expect(dit).not.toContain(saisi)
})

test('avecLEchecDuReseau rend la saisie telle qu’elle a été tapée', async () => {
	const action = avecLEchecDuReseau(async () => {
		throw new Error('réseau')
	})
	const formulaire = new FormData()
	formulaire.set('prenom', 'Léa')
	formulaire.set('message', 'Bonjour')
	expect(await action(null, formulaire)).toEqual({
		echec: true,
		reseau: true,
		valeurs: { prenom: 'Léa', nom: '', email: '', telephone: '', message: 'Bonjour' },
	})
})
