import { expect, test } from 'bun:test'
import { SignInForm } from '@/components/auth/SignInForm'
import { openWindow } from '../support/dom-react'

const jsdomWindow = openWindow()

function formValue(action: (p: null, f: FormData) => Promise<{ code: 'identifiants-invalides' } | null>) {
	return <SignInForm action={action as never} retour="/auth/profil" />
}

test('une saisie fausse annonce l’erreur dans une zone role=alert', async () => {
	const zone = await jsdomWindow.monter(formValue(async () => ({ code: 'identifiants-invalides' })))
	await jsdomWindow.saisir(jsdomWindow.champ('Adresse email'), 'a@example.test')
	await jsdomWindow.saisir(jsdomWindow.champ('Mot de passe'), 'x')

	await jsdomWindow.cliquer(jsdomWindow.bouton('Se connecter'))

	const alert = await jsdomWindow.attendre(() => zone.querySelector('[role="alert"] p'))
	expect(alert.textContent).toBe('Email ou mot de passe incorrect.')
})

test('Entrée maintenue : un seul envoi tant que le premier n’a pas répondu', async () => {
	let uploads = 0
	let respond: () => void = () => {}
	const zone = await jsdomWindow.monter(
		formValue(() => {
			uploads++
			return new Promise(fin => {
				respond = () => fin({ code: 'identifiants-invalides' })
			})
		})
	)
	await jsdomWindow.saisir(jsdomWindow.champ('Adresse email'), 'a@example.test')
	await jsdomWindow.saisir(jsdomWindow.champ('Mot de passe'), 'x')
	const form = zone.querySelector('form') as HTMLFormElement

	for (let i = 0; i < 5; i++) form.requestSubmit()
	await new Promise(r => setTimeout(r, 20))
	expect(uploads).toBe(1)

	respond()
	await jsdomWindow.attendre(() => zone.querySelector('[role="alert"] p'))
})

test('le champ email et le champ mot de passe portent les attributs des gestionnaires de mots de passe', async () => {
	const zone = await jsdomWindow.monter(formValue(async () => null))
	expect(zone.querySelector('#email')?.getAttribute('autocomplete')).toBe('email')
	expect(zone.querySelector('#password')?.getAttribute('autocomplete')).toBe('current-password')
	expect(zone.querySelector('#password')?.getAttribute('minlength')).toBeNull()
})
