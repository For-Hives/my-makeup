import { expect, test } from 'bun:test'
import { type ContactAction, ContactForm, withNetworkFailure } from '@/components/contact/ContactForm'
import { type ContactMessage, type ContactState, MESSAGE_TOO_MANY_MESSAGES } from '@/lib/contact/message'
import { openWindow } from '../support/dom-react'

/** The contact form alone, in a jsdom window (tickets 158 and 160; plan 02 E51 and E69 are played in a browser by tests/e2e/contact.spec.ts). */

const jsdomWindow = openWindow()

const VALUES: ContactMessage = {
	prenom: 'Léa',
	nom: 'Témoin',
	email: 'lea.temoin@example.test',
	telephone: '01 99 00 12 34',
	message: 'Une question.',
}

type Analytics = { nom: string; proprietes: { ok: boolean; status: number } }

function mount(action: ContactAction) {
	const measured: Analytics[] = []
	const follow = (nom: 'platform_contact_submit', proprietes: { ok: boolean; status: number }) =>
		void measured.push({ nom, proprietes })
	return { mesures: measured, element: <ContactForm action={action} suivre={follow} /> }
}

async function fill(valeurs: Partial<ContactMessage> = {}) {
	const v = { ...VALUES, ...valeurs }
	await jsdomWindow.saisir(jsdomWindow.champ('Prénom'), v.prenom)
	await jsdomWindow.saisir(jsdomWindow.champ('Nom'), v.nom)
	await jsdomWindow.saisir(jsdomWindow.champ('Email'), v.email)
	await jsdomWindow.saisir(jsdomWindow.champ('Numéro de téléphone (facultatif)'), v.telephone)
	await jsdomWindow.saisir(jsdomWindow.champ('Message'), v.message)
}

test('les cinq champs du site en ligne, étiquetés, avec les attributs des navigateurs', async () => {
	const { element } = mount(async () => null)
	const zone = await jsdomWindow.monter(element)

	expect(jsdomWindow.champ('Prénom').getAttribute('autocomplete')).toBe('given-name')
	expect(jsdomWindow.champ('Nom').getAttribute('autocomplete')).toBe('family-name')
	expect(jsdomWindow.champ('Email').getAttribute('type')).toBe('email')
	expect(jsdomWindow.champ('Numéro de téléphone (facultatif)').getAttribute('type')).toBe('tel')
	expect(jsdomWindow.champ('Message').tagName).toBe('TEXTAREA')
	expect(zone.querySelector('form')?.hasAttribute('novalidate')).toBe(true)
	expect(zone.querySelector('a[href="/politique-de-confidentialite"]')).toBeTruthy()
})

test('un envoi réussi laisse la place à la confirmation, annoncée comme un statut', async () => {
	const { element } = mount(async () => ({ envoye: true }))
	const zone = await jsdomWindow.monter(element)
	await fill()

	await jsdomWindow.cliquer(jsdomWindow.bouton('Envoyer l’email'))

	const confirmation = await jsdomWindow.attendre(() => zone.querySelector('[data-testid="contact-envoye"]'))
	expect(confirmation.getAttribute('role')).toBe('status')
	expect(confirmation.textContent).toBe('Le message a bien été envoyé !')
	expect(zone.querySelector('form')).toBeNull()
})

test('E51 : les erreurs sont sous leur champ, en français, et le premier champ en erreur prend le focus', async () => {
	const errors = { nom: 'Le nom est requis', email: 'L’e-mail est invalide' }
	const { element } = mount(async () => ({ erreurs: errors, valeurs: { ...VALUES, nom: '', email: 'x' } }))
	const zone = await jsdomWindow.monter(element)

	await jsdomWindow.cliquer(jsdomWindow.bouton('Envoyer l’email'))
	await jsdomWindow.attendre(() => zone.querySelector('[data-testid="erreur-nom"]')?.textContent)

	expect(zone.querySelector('[data-testid="erreur-nom"]')?.textContent).toBe('Le nom est requis')
	expect(zone.querySelector('[data-testid="erreur-email"]')?.textContent).toBe('L’e-mail est invalide')
	expect(zone.querySelector('[data-testid="erreur-prenom"]')?.textContent).toBe('')
	const name = jsdomWindow.champ('Nom')
	expect(name.getAttribute('aria-invalid')).toBe('true')
	expect(name.getAttribute('aria-describedby')).toBe('erreur-nom')
	expect(jsdomWindow.champ('Prénom').getAttribute('aria-invalid')).toBeNull()
	// The first one in the order of the form, not the last.
	expect(jsdomWindow.w.document.activeElement).toBe(name)
	// The summary is announced.
	expect(zone.querySelector('[role="alert"]')?.textContent).toContain('corrigez les champs signalés')
})

test('E69 : une erreur annonce un résumé, et la saisie reste dans les champs', async () => {
	const { element } = mount(async () => ({
		erreurs: { email: 'L’e-mail est invalide' },
		valeurs: { ...VALUES, telephone: '' },
	}))
	const zone = await jsdomWindow.monter(element)
	await fill({ telephone: '' })

	await jsdomWindow.cliquer(jsdomWindow.bouton('Envoyer l’email'))
	await jsdomWindow.attendre(() => zone.querySelector('[data-testid="erreur-email"]')?.textContent)

	expect(jsdomWindow.champ('Prénom').value).toBe('Léa')
	expect(jsdomWindow.champ('Email').value).toBe('lea.temoin@example.test')
	expect(jsdomWindow.champ('Message').value).toBe('Une question.')
})

test('après un échec d’enregistrement, la saisie reste et le message le dit', async () => {
	const { element } = mount(async () => ({ echec: true, valeurs: VALUES }))
	const zone = await jsdomWindow.monter(element)
	await fill()

	await jsdomWindow.cliquer(jsdomWindow.bouton('Envoyer l’email'))
	await jsdomWindow.attendre(() => zone.querySelector('[role="alert"] p'))

	expect(zone.querySelector('[role="alert"]')?.textContent).toContain('Une erreur s’est produite !')
	expect(jsdomWindow.champ('Prénom').value).toBe('Léa')
	expect(jsdomWindow.champ('Nom').value).toBe('Témoin')
	expect(jsdomWindow.champ('Email').value).toBe('lea.temoin@example.test')
	expect(jsdomWindow.champ('Numéro de téléphone (facultatif)').value).toBe('01 99 00 12 34')
	expect(jsdomWindow.champ('Message').value).toBe('Une question.')
	// She can send again.
	expect((jsdomWindow.bouton('Envoyer l’email') as HTMLButtonElement).disabled).toBe(false)
})

test('une requête qui échoue en route garde la saisie et compte comme un échec sans statut', async () => {
	const { element, mesures: measured } = mount(async () => {
		throw new Error('Failed to fetch')
	})
	const zone = await jsdomWindow.monter(element)
	await fill()

	await jsdomWindow.cliquer(jsdomWindow.bouton('Envoyer l’email'))
	await jsdomWindow.attendre(() => zone.querySelector('[role="alert"] p'))

	expect(jsdomWindow.champ('Message').value).toBe('Une question.')
	expect(measured).toEqual([{ nom: 'platform_contact_submit', proprietes: { ok: false, status: 0 } }])
})

test('160 : un double clic et Entrée maintenue n’envoient qu’un message', async () => {
	let uploads = 0
	let respond: () => void = () => {}
	const { element } = mount(() => {
		uploads++
		return new Promise<ContactState>(fin => {
			respond = () => fin({ envoye: true })
		})
	})
	const zone = await jsdomWindow.monter(element)
	await fill()
	const button = jsdomWindow.bouton('Envoyer l’email')
	const form = zone.querySelector('form') as HTMLFormElement

	await jsdomWindow.cliquer(button)
	await jsdomWindow.cliquer(button)
	// Enter held in a field: the browser submits again and again.
	for (let i = 0; i < 5; i++) form.requestSubmit()
	await new Promise(r => setTimeout(r, 20))

	expect(uploads).toBe(1)
	expect((jsdomWindow.bouton('Envoi…') as HTMLButtonElement).disabled).toBe(true)

	respond()
	await jsdomWindow.attendre(() => zone.querySelector('[data-testid="contact-envoye"]'))
	expect(uploads).toBe(1)
})

test('après une réponse, un nouvel envoi est possible', async () => {
	let uploads = 0
	const { element } = mount(async () => {
		uploads++
		return { echec: true, valeurs: VALUES }
	})
	const zone = await jsdomWindow.monter(element)
	await fill()

	await jsdomWindow.cliquer(jsdomWindow.bouton('Envoyer l’email'))
	await jsdomWindow.attendre(() => zone.querySelector('[role="alert"] p'))
	await jsdomWindow.cliquer(jsdomWindow.bouton('Envoyer l’email'))
	await jsdomWindow.attendre(() => uploads === 2)

	expect(uploads).toBe(2)
})

test('l’événement de mesure part une fois par réponse, avec le résultat et jamais un texte saisi', async () => {
	const responses: ContactState[] = [
		{ erreurs: { nom: 'Le nom est requis' }, valeurs: VALUES },
		{ echec: true, valeurs: VALUES },
		{ envoye: true },
	]
	const { element, mesures: measured } = mount(async () => responses.shift() ?? null)
	const zone = await jsdomWindow.monter(element)
	await fill()

	expect(measured).toEqual([])
	for (let i = 0; i < 3; i++) {
		await jsdomWindow.cliquer(jsdomWindow.bouton('Envoyer l’email'))
		await jsdomWindow.attendre(() => measured.length === i + 1 || undefined)
		// Let any other render settle: the count must not move without a new answer.
		await new Promise(r => setTimeout(r, 10))
	}
	await jsdomWindow.attendre(() => zone.querySelector('[data-testid="contact-envoye"]'))

	expect(measured.map(m => m.proprietes)).toEqual([
		{ ok: false, status: 400 },
		{ ok: false, status: 500 },
		{ ok: true, status: 200 },
	])
	const said = JSON.stringify(measured)
	for (const typed of Object.values(VALUES)) expect(said).not.toContain(typed)
})

test('avecLEchecDuReseau rend la saisie telle qu’elle a été tapée', async () => {
	const action = withNetworkFailure(async () => {
		throw new Error('réseau')
	})
	const formValue = new FormData()
	formValue.set('prenom', 'Léa')
	formValue.set('message', 'Bonjour')
	expect(await action(null, formValue)).toEqual({
		echec: true,
		reseau: true,
		valeurs: { prenom: 'Léa', nom: '', email: '', telephone: '', message: 'Bonjour' },
	})
})

test('161 : le champ piège est hors de vue, hors du clavier et caché aux lecteurs d’écran', async () => {
	const { element } = mount(async () => null)
	const zone = await jsdomWindow.monter(element)

	const trap = zone.querySelector<HTMLInputElement>('input[name="commentaire"]')
	expect(trap).toBeTruthy()
	expect(trap?.getAttribute('tabindex')).toBe('-1')
	expect(trap?.getAttribute('autocomplete')).toBe('off')
	expect(trap?.value).toBe('')
	expect(trap?.closest('[aria-hidden="true"]')).toBeTruthy()
})

test('161 : une limite atteinte dit la phrase en français, garde la saisie et compte 429', async () => {
	const { element, mesures: measured } = mount(async () => ({ limite: true, valeurs: VALUES }))
	const zone = await jsdomWindow.monter(element)
	await fill()

	await jsdomWindow.cliquer(jsdomWindow.bouton('Envoyer l’email'))
	await jsdomWindow.attendre(() => zone.querySelector('[role="alert"] p'))

	expect(zone.querySelector('[role="alert"]')?.textContent).toContain('beaucoup de messages en peu de temps')
	expect(jsdomWindow.champ('Message').value).toBe('Une question.')
	expect(jsdomWindow.champ('Email').value).toBe('lea.temoin@example.test')
	expect(measured.map(m => m.proprietes)).toEqual([{ ok: false, status: 429 }])
})

test('161 : le 429 du proxy, relevé par le script de Next, redevient une limite avec la saisie gardée', async () => {
	const action = withNetworkFailure(async () => {
		throw new Error(MESSAGE_TOO_MANY_MESSAGES)
	})
	const formValue = new FormData()
	for (const [key, value] of Object.entries(VALUES)) formValue.set(key, value)

	expect(await action(null, formValue)).toEqual({ limite: true, valeurs: VALUES })
})

// Turnstile (ticket 1000).
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

test('Turnstile : sans clé de site, aucun script et aucun cadre', async () => {
	const { element } = mount(async () => null)
	const zone = await jsdomWindow.monter(element)

	expect(jsdomWindow.w.document.querySelector(`script[src="${TURNSTILE_SRC}"]`)).toBeNull()
	expect(zone.querySelector('[data-testid="turnstile"]')).toBeNull()
})

test('Turnstile : avec une clé, le script de Cloudflare est chargé et, tant qu’il va bien, aucun signal de panne n’est envoyé', async () => {
	const measured: Analytics[] = []
	const element = (
		<ContactForm
			action={async () => null}
			siteKey="0x4AAAAAAexample"
			suivre={(nom, proprietes) => void measured.push({ nom, proprietes })}
		/>
	)
	const zone = await jsdomWindow.monter(element)

	expect(jsdomWindow.w.document.querySelector(`script[src="${TURNSTILE_SRC}"]`)).toBeTruthy()
	expect(zone.querySelector('[data-testid="turnstile"]')).toBeTruthy()
	expect(zone.querySelector('input[name="turnstile-unavailable"]')).toBeNull()
})

test('Turnstile : un script qui ne charge pas (bloqueur, panne) pose le signal de panne et le formulaire reste utilisable', async () => {
	const zone = await jsdomWindow.monter(<ContactForm action={async () => null} siteKey="0x4AAAAAAexample" />)
	const script = jsdomWindow.w.document.querySelector(`script[src="${TURNSTILE_SRC}"]`)
	expect(script).toBeTruthy()

	await jsdomWindow.attendre(() => {
		script?.dispatchEvent(new jsdomWindow.w.Event('error'))
		return zone.querySelector('input[name="turnstile-unavailable"]')
	})

	expect(zone.querySelector<HTMLInputElement>('input[name="turnstile-unavailable"]')?.value).toBe('1')
	expect((jsdomWindow.bouton('Envoyer l’email') as HTMLButtonElement).disabled).toBe(false)
})

test('Turnstile : une vérification refusée garde la saisie et le dit', async () => {
	const { element } = mount(async () => ({ verification: true, valeurs: VALUES }))
	const zone = await jsdomWindow.monter(element)
	await fill()

	await jsdomWindow.cliquer(jsdomWindow.bouton('Envoyer l’email'))
	await jsdomWindow.attendre(() => zone.querySelector('[role="alert"] p'))

	expect(zone.querySelector('[role="alert"]')?.textContent).toContain('La vérification anti-robot n’a pas abouti.')
	expect(jsdomWindow.champ('Message').value).toBe('Une question.')
})
