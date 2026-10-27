import { expect, test } from 'bun:test'
import { type QuoteAction, QuoteRequestForm } from '@/components/quote/QuoteRequestForm'
import type { QuoteState, QuoteValues } from '@/lib/quote/request'
import { openWindow } from '../support/dom-react'

/** The quote form alone, in a jsdom window (issue 1003). The same form in a browser: tests/e2e/quote-requests.spec.ts. */

const jsdomWindow = openWindow()

const VALUES: QuoteValues = {
	eventDate: '2028-06-12',
	place: 'Annecy',
	serviceType: 'wedding',
	message: 'Mariage civil, une trentaine d’invités.',
	firstName: 'Camille',
	email: 'camille@example.test',
	phone: '',
}

function mount(action: QuoteAction) {
	return <QuoteRequestForm action={action} slug="profil-fictif" pid={null} />
}

async function fill(over: Partial<QuoteValues> = {}) {
	const v = { ...VALUES, ...over }
	await jsdomWindow.saisir(jsdomWindow.champ('Date de l’événement'), v.eventDate)
	await jsdomWindow.saisir(jsdomWindow.champ('Type de prestation'), v.serviceType)
	await jsdomWindow.saisir(jsdomWindow.champ('Lieu de l’événement'), v.place)
	await jsdomWindow.saisir(jsdomWindow.champ('Votre message'), v.message)
	await jsdomWindow.saisir(jsdomWindow.champ('Votre prénom'), v.firstName)
	await jsdomWindow.saisir(jsdomWindow.champ('Votre email'), v.email)
}

test('les champs sont étiquetés, avec les attributs des navigateurs, et la case de consentement porte le lien', async () => {
	const zone = await jsdomWindow.monter(mount(async () => null))
	expect(jsdomWindow.champ('Date de l’événement').getAttribute('type')).toBe('date')
	expect(jsdomWindow.champ('Type de prestation').tagName).toBe('SELECT')
	expect(jsdomWindow.champ('Votre message').tagName).toBe('TEXTAREA')
	expect(jsdomWindow.champ('Votre prénom').getAttribute('autocomplete')).toBe('given-name')
	expect(jsdomWindow.champ('Votre email').getAttribute('type')).toBe('email')
	expect(jsdomWindow.champ('Votre téléphone (facultatif)').getAttribute('type')).toBe('tel')
	expect(zone.querySelector('input[type="checkbox"][name="consent"]')).toBeTruthy()
	expect(zone.querySelector('a[href="/politique-de-confidentialite"]')).toBeTruthy()
	expect(zone.querySelector('input[name="profile"]')?.getAttribute('value')).toBe('profil-fictif')
	expect(zone.querySelector('form')?.hasAttribute('novalidate')).toBe(true)
	// The champ piège is out of the tab order and hidden from readers.
	expect(zone.querySelector('input[name="commentaire"]')?.getAttribute('tabindex')).toBe('-1')
})

test('chaque cible a au moins 44 px : les champs, le bouton et la case', async () => {
	const zone = await jsdomWindow.monter(mount(async () => null))
	for (const control of zone.querySelectorAll(
		'input[type="date"], select, input[type="text"][id^="devis-"], input[type="email"], input[type="tel"]'
	))
		expect(control.className).toMatch(/min-h-(11|12|13)/)
	expect(jsdomWindow.bouton('Envoyer ma demande').className).toMatch(/min-h-(12|13)/)
	expect(zone.querySelector('label[for="devis-consent"]')?.className).toContain('min-h-11')
})

test('un envoi réussi laisse la place à la confirmation, annoncée comme un statut', async () => {
	const zone = await jsdomWindow.monter(mount(async () => ({ sent: true })))
	await fill()
	await jsdomWindow.cliquer(jsdomWindow.bouton('Envoyer ma demande'))
	const confirmation = await jsdomWindow.attendre(() => zone.querySelector('[data-testid="devis-envoye"]'))
	expect(confirmation.getAttribute('role')).toBe('status')
	expect(confirmation.textContent).toContain('Votre demande a bien été envoyée')
	expect(zone.querySelector('form')).toBeNull()
})

test('les erreurs sont sous leur champ, le premier champ en erreur prend le focus, la saisie reste', async () => {
	const errors = { place: 'Le lieu est requis', consent: 'Cochez la case pour envoyer votre demande' }
	const zone = await jsdomWindow.monter(mount(async () => ({ errors, values: { ...VALUES, place: '' } })))
	await fill({ place: '' })
	await jsdomWindow.cliquer(jsdomWindow.bouton('Envoyer ma demande'))
	await jsdomWindow.attendre(() => zone.querySelector('[data-testid="erreur-devis-place"]')?.textContent)

	expect(zone.querySelector('[data-testid="erreur-devis-place"]')?.textContent).toBe('Le lieu est requis')
	expect(zone.querySelector('[data-testid="erreur-devis-consent"]')?.textContent).toBe(
		'Cochez la case pour envoyer votre demande'
	)
	const place = jsdomWindow.champ('Lieu de l’événement')
	expect(place.getAttribute('aria-invalid')).toBe('true')
	expect(place.getAttribute('aria-describedby')).toBe('erreur-devis-place')
	expect(jsdomWindow.w.document.activeElement).toBe(place)
	expect(jsdomWindow.champ('Votre prénom').value).toBe('Camille')
	expect(jsdomWindow.champ('Votre message').value).toBe(VALUES.message)
	expect(zone.querySelector('[role="alert"]')?.textContent).toContain('corrigez les champs signalés')
})

test.each([
	['un échec d’enregistrement', { failure: true, values: VALUES }, 'Une erreur s’est produite'],
	['un frein', { throttled: true, values: VALUES }, 'beaucoup de demandes'],
	['une vérification refusée', { verification: true, values: VALUES }, 'vérification anti-robot'],
] as const)('%s : la saisie reste et le message le dit', async (_name, state, text) => {
	const zone = await jsdomWindow.monter(mount(async () => state as QuoteState))
	await jsdomWindow.cliquer(jsdomWindow.bouton('Envoyer ma demande'))
	await jsdomWindow.attendre(() => zone.querySelector('[role="alert"] p'))
	expect(zone.querySelector('[role="alert"]')?.textContent).toContain(text)
	expect(jsdomWindow.champ('Votre email').value).toBe(VALUES.email)
	expect((jsdomWindow.bouton('Envoyer ma demande') as HTMLButtonElement).disabled).toBe(false)
})

test('une requête qui échoue en route garde la saisie', async () => {
	const zone = await jsdomWindow.monter(
		mount(async () => {
			throw new Error('Failed to fetch')
		})
	)
	await fill()
	await jsdomWindow.cliquer(jsdomWindow.bouton('Envoyer ma demande'))
	await jsdomWindow.attendre(() => zone.querySelector('[role="alert"] p'))
	expect(jsdomWindow.champ('Votre message').value).toBe(VALUES.message)
	expect(zone.querySelector('[role="alert"]')?.textContent).toContain('Une erreur s’est produite')
})

test('un profil qui ne prend plus de demandes le dit à la place du formulaire', async () => {
	const zone = await jsdomWindow.monter(mount(async () => ({ unavailable: true })))
	await jsdomWindow.cliquer(jsdomWindow.bouton('Envoyer ma demande'))
	const note = await jsdomWindow.attendre(() => zone.querySelector('[data-testid="devis-indisponible"]'))
	expect(note.textContent).toContain('ne reçoit pas de demandes de devis')
	expect(zone.querySelector('form')).toBeNull()
})

test('un double clic n’envoie qu’une demande', async () => {
	let uploads = 0
	let respond: () => void = () => {}
	const zone = await jsdomWindow.monter(
		mount(() => {
			uploads++
			return new Promise<QuoteState>(done => {
				respond = () => done({ sent: true })
			})
		})
	)
	await fill()
	const button = jsdomWindow.bouton('Envoyer ma demande')
	await jsdomWindow.cliquer(button)
	await jsdomWindow.cliquer(button)
	expect(uploads).toBe(1)
	respond()
	await jsdomWindow.attendre(() => zone.querySelector('[data-testid="devis-envoye"]'))
})
