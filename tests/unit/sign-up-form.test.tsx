import { expect, test } from 'bun:test'
import { SignUpForm, type SignUpState, withProxyRefusal } from '@/components/auth/SignUpForm'
import { SIGN_UP_FAILURE_MESSAGES, SIGN_UP_MESSAGES, TRAP_FIELD } from '@/lib/auth/sign-up'
import { openWindow } from '../support/dom-react'

const jsdomWindow = openWindow()

const formValue = (action: (p: SignUpState, f: FormData) => Promise<SignUpState>) => (
	<SignUpForm action={action as never} />
)

test('U25 : un message par champ, sous le champ, relié à lui pour un lecteur d’écran', async () => {
	const zone = await jsdomWindow.monter(
		formValue(async () => ({
			erreurs: {
				prenom: SIGN_UP_MESSAGES.prenom.vide,
				nom: SIGN_UP_MESSAGES.nom.vide,
				email: SIGN_UP_MESSAGES.email.invalide,
				password: SIGN_UP_MESSAGES.password.court,
				cgu: SIGN_UP_MESSAGES.cgu.refusees,
			},
			valeurs: { prenom: '', nom: '', email: 'lea', cgu: false },
		}))
	)

	await jsdomWindow.cliquer(jsdomWindow.bouton('S’inscrire'))

	await jsdomWindow.attendre(() => zone.querySelector('#erreur-nom')?.textContent)
	expect(zone.querySelector('#erreur-prenom')?.textContent).toBe(SIGN_UP_MESSAGES.prenom.vide)
	expect(zone.querySelector('#erreur-nom')?.textContent).toBe(SIGN_UP_MESSAGES.nom.vide)
	expect(zone.querySelector('#erreur-email')?.textContent).toBe(SIGN_UP_MESSAGES.email.invalide)
	expect(zone.querySelector('#erreur-password')?.textContent).toBe(SIGN_UP_MESSAGES.password.court)
	expect(zone.querySelector('#erreur-cgu')?.textContent).toBe(SIGN_UP_MESSAGES.cgu.refusees)
	for (const [id, field] of [
		['prenom', 'prenom'],
		['nom', 'nom'],
		['email', 'email'],
		['password', 'password'],
		['cgu', 'cgu'],
	] as const) {
		const input = zone.querySelector(`#${id}`)
		expect(input?.getAttribute('aria-invalid')).toBe('true')
		expect(input?.getAttribute('aria-describedby')).toContain(`erreur-${field}`)
	}
})

test('ce qu’elle a tapé revient, le mot de passe jamais', async () => {
	const zone = await jsdomWindow.monter(
		formValue(async () => ({
			erreurs: { password: SIGN_UP_MESSAGES.password.court },
			valeurs: { prenom: 'Léa', nom: 'Fictive', email: 'lea@example.test', cgu: true },
		}))
	)
	await jsdomWindow.saisir(jsdomWindow.champ('Mot de passe'), 'secret-tape-12345')

	await jsdomWindow.cliquer(jsdomWindow.bouton('S’inscrire'))
	await jsdomWindow.attendre(() => zone.querySelector('#erreur-password')?.textContent)

	expect((jsdomWindow.champ('Prénom') as HTMLInputElement).value).toBe('Léa')
	expect((jsdomWindow.champ('Nom') as HTMLInputElement).value).toBe('Fictive')
	expect((jsdomWindow.champ('Adresse email') as HTMLInputElement).value).toBe('lea@example.test')
	expect((jsdomWindow.champ('Mot de passe') as HTMLInputElement).value).toBe('')
	expect(zone.innerHTML).not.toContain('secret-tape-12345')
})

test('un refus du serveur qui n’est pas un champ (adresse déjà utilisée) s’annonce dans une zone role=alert', async () => {
	const zone = await jsdomWindow.monter(formValue(async () => ({ echec: 'email-deja-pris' })))

	await jsdomWindow.cliquer(jsdomWindow.bouton('S’inscrire'))

	const alert = await jsdomWindow.attendre(() => zone.querySelector('[role="alert"] p'))
	expect(alert.textContent).toBe(SIGN_UP_FAILURE_MESSAGES['email-deja-pris'])
})

test('les attributs des gestionnaires de mots de passe : nom, email, nouveau mot de passe', async () => {
	const zone = await jsdomWindow.monter(formValue(async () => null))
	expect(zone.querySelector('#prenom')?.getAttribute('autocomplete')).toBe('given-name')
	expect(zone.querySelector('#nom')?.getAttribute('autocomplete')).toBe('family-name')
	expect(zone.querySelector('#email')?.getAttribute('autocomplete')).toBe('email')
	expect(zone.querySelector('#password')?.getAttribute('autocomplete')).toBe('new-password')
	expect(zone.querySelector('form')?.hasAttribute('novalidate')).toBe(true)
})

test('Entrée maintenue : un seul envoi tant que le premier n’a pas répondu', async () => {
	let uploads = 0
	let respond: () => void = () => {}
	const zone = await jsdomWindow.monter(
		formValue(() => {
			uploads++
			return new Promise(fin => {
				respond = () => fin({ echec: 'service-indisponible' })
			})
		})
	)
	const form = zone.querySelector('form') as HTMLFormElement

	for (let i = 0; i < 5; i++) form.requestSubmit()
	await new Promise(r => setTimeout(r, 20))
	expect(uploads).toBe(1)

	respond()
	await jsdomWindow.attendre(() => zone.querySelector('[role="alert"] p'))
})

test('le champ piège existe, hors de vue, hors du clavier et caché des lecteurs d’écran (ticket 084)', async () => {
	const zone = await jsdomWindow.monter(formValue(async () => null))

	const trap = zone.querySelector(`input[name="${TRAP_FIELD}"]`)
	expect(trap).not.toBeNull()
	expect(trap?.getAttribute('tabindex')).toBe('-1')
	expect(trap?.getAttribute('autocomplete')).toBe('off')
	expect(trap?.closest('[aria-hidden="true"]')).not.toBeNull()
	expect((trap as HTMLInputElement).value).toBe('')
})

test('le refus du frein par adresse se lit en français sous le formulaire', async () => {
	const zone = await jsdomWindow.monter(formValue(async () => ({ echec: 'trop-de-tentatives' })))

	await jsdomWindow.cliquer(jsdomWindow.bouton('S’inscrire'))
	await jsdomWindow.attendre(() => zone.querySelector('[data-testid="erreur-inscription"]')?.textContent)

	expect(zone.querySelector('[data-testid="erreur-inscription"]')?.textContent).toBe(
		SIGN_UP_FAILURE_MESSAGES['trop-de-tentatives']
	)
})

test('le 429 du proxy, que le script de Next jette comme une erreur, redevient un refus montré sous le formulaire', async () => {
	const zone = await jsdomWindow.monter(
		formValue(async () => {
			throw new Error(SIGN_UP_FAILURE_MESSAGES['trop-de-tentatives'])
		})
	)
	await jsdomWindow.saisir(jsdomWindow.champ('Adresse email'), 'lea@example.test')

	await jsdomWindow.cliquer(jsdomWindow.bouton('S’inscrire'))

	const alert = await jsdomWindow.attendre(() => zone.querySelector('[role="alert"] p'))
	expect(alert.textContent).toBe(SIGN_UP_FAILURE_MESSAGES['trop-de-tentatives'])
	expect((jsdomWindow.champ('Adresse email') as HTMLInputElement).value).toBe('lea@example.test')
})

test('une autre erreur n’est pas avalée', async () => {
	const action = withProxyRefusal(async () => {
		throw new Error('panne')
	})

	await expect(action(null, new FormData())).rejects.toThrow('panne')
})
