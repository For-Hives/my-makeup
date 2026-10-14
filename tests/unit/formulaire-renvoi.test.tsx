import { expect, test } from 'bun:test'
import { type EtatDeRenvoi, FormulaireDeRenvoi } from '@/components/auth/FormulaireDeRenvoi'
import { ouvrirFenetre } from '../outils/dom-react'

const fenetre = ouvrirFenetre()

const formulaire = (action: (p: EtatDeRenvoi, f: FormData) => Promise<EtatDeRenvoi>) => (
	<FormulaireDeRenvoi action={action as never} />
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
