import { expect, test } from 'bun:test'
import { ResendForm, type ResendState } from '@/components/auth/ResendForm'
import { openWindow } from '../support/dom-react'

const jsdomWindow = openWindow()

const form = (action: (p: ResendState, f: FormData) => Promise<ResendState>) => <ResendForm action={action as never} />

test('le renvoi de la confirmation : le champ est étiqueté, la réponse se lit dans une zone d’état', async () => {
	const zone = await jsdomWindow.monter(
		form(async () => ({ reussi: 'Un email vient de repartir.', valeur: 'lea@example.test' }))
	)
	expect(jsdomWindow.champ('Adresse email de ton inscription')).toBeTruthy()

	await jsdomWindow.cliquer(jsdomWindow.bouton('Renvoyer l’email de confirmation'))
	await jsdomWindow.attendre(() => zone.querySelector('#retour-renvoi')?.textContent)

	const returnUrl = zone.querySelector('#retour-renvoi')
	expect(returnUrl?.getAttribute('role')).toBe('status')
	expect(returnUrl?.textContent).toBe('Un email vient de repartir.')
	expect(jsdomWindow.champ('Adresse email de ton inscription').getAttribute('aria-describedby')).toBe('retour-renvoi')
})

test('un refus se lit en français et marque le champ en erreur', async () => {
	const zone = await jsdomWindow.monter(
		form(async () => ({ erreur: 'Un seul email par minute.', valeur: 'lea@example.test' }))
	)

	await jsdomWindow.cliquer(jsdomWindow.bouton('Renvoyer l’email de confirmation'))
	await jsdomWindow.attendre(() => zone.querySelector('#retour-renvoi')?.textContent)

	expect(zone.querySelector('#retour-renvoi')?.textContent).toBe('Un seul email par minute.')
	expect(jsdomWindow.champ('Adresse email de ton inscription').getAttribute('aria-invalid')).toBe('true')
})
