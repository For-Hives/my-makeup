import { expect, test } from 'bun:test'
import { FormulaireDeConnexion } from '@/components/auth/FormulaireDeConnexion'
import { ouvrirFenetre } from '../outils/dom-react'

const fenetre = ouvrirFenetre()

function formulaire(action: (p: null, f: FormData) => Promise<{ code: 'identifiants-invalides' } | null>) {
	return <FormulaireDeConnexion action={action as never} retour="/auth/profil" />
}

test('une saisie fausse annonce l’erreur dans une zone role=alert', async () => {
	const zone = await fenetre.monter(formulaire(async () => ({ code: 'identifiants-invalides' })))
	await fenetre.saisir(fenetre.champ('Adresse email'), 'a@example.test')
	await fenetre.saisir(fenetre.champ('Mot de passe'), 'x')

	await fenetre.cliquer(fenetre.bouton('Se connecter'))

	const alerte = await fenetre.attendre(() => zone.querySelector('[role="alert"] p'))
	expect(alerte.textContent).toBe('Email ou mot de passe incorrect.')
})

test('Entrée maintenue : un seul envoi tant que le premier n’a pas répondu', async () => {
	let envois = 0
	let repondre: () => void = () => {}
	const zone = await fenetre.monter(
		formulaire(() => {
			envois++
			return new Promise(fin => {
				repondre = () => fin({ code: 'identifiants-invalides' })
			})
		})
	)
	await fenetre.saisir(fenetre.champ('Adresse email'), 'a@example.test')
	await fenetre.saisir(fenetre.champ('Mot de passe'), 'x')
	const form = zone.querySelector('form') as HTMLFormElement

	for (let i = 0; i < 5; i++) form.requestSubmit()
	await new Promise(r => setTimeout(r, 20))
	expect(envois).toBe(1)

	repondre()
	await fenetre.attendre(() => zone.querySelector('[role="alert"] p'))
})

test('le champ email et le champ mot de passe portent les attributs des gestionnaires de mots de passe', async () => {
	const zone = await fenetre.monter(formulaire(async () => null))
	expect(zone.querySelector('#email')?.getAttribute('autocomplete')).toBe('email')
	expect(zone.querySelector('#password')?.getAttribute('autocomplete')).toBe('current-password')
	expect(zone.querySelector('#password')?.getAttribute('minlength')).toBeNull()
})
