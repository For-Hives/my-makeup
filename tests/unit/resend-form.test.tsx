import { expect, test } from 'bun:test'
import { ResendForm, type ResendState } from '@/components/auth/ResendForm'
import { openWindow } from '../support/dom-react'

const fenetre = openWindow()

const formulaire = (action: (p: ResendState, f: FormData) => Promise<ResendState>) => (
	<ResendForm action={action as never} />
)

test('le renvoi de la confirmation : le champ est étiqueté, la réponse se lit dans une zone d’état', async () => {
	const zone = await fenetre.monter(
		formulaire(async () => ({ reussi: 'Un email vient de repartir.', valeur: 'lea@example.test' }))
	)
	expect(fenetre.champ('Adresse email de ton inscription')).toBeTruthy()

	await fenetre.cliquer(fenetre.bouton('Renvoyer l’email de confirmation'))
	await fenetre.attendre(() => zone.querySelector('#retour-renvoi')?.textContent)

	const retour = zone.querySelector('#retour-renvoi')
	expect(retour?.getAttribute('role')).toBe('status')
	expect(retour?.textContent).toBe('Un email vient de repartir.')
	expect(fenetre.champ('Adresse email de ton inscription').getAttribute('aria-describedby')).toBe('retour-renvoi')
})

test('un refus se lit en français et marque le champ en erreur', async () => {
	const zone = await fenetre.monter(
		formulaire(async () => ({ erreur: 'Un seul email par minute.', valeur: 'lea@example.test' }))
	)

	await fenetre.cliquer(fenetre.bouton('Renvoyer l’email de confirmation'))
	await fenetre.attendre(() => zone.querySelector('#retour-renvoi')?.textContent)

	expect(zone.querySelector('#retour-renvoi')?.textContent).toBe('Un seul email par minute.')
	expect(fenetre.champ('Adresse email de ton inscription').getAttribute('aria-invalid')).toBe('true')
})
