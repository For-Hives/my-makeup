import { describe, expect, test } from 'bun:test'
import { act } from 'react'
import { type EnvoiDeLaSuppression, SuppressionDuCompte } from '@/components/espace/SuppressionDuCompte'
import {
	CONFIRMATION_MAX,
	MESSAGES_DE_SUPPRESSION,
	type ModeDeConfirmation,
	modeDeConfirmation,
	schemaDeLaSuppression,
} from '@/lib/espace/confirmation-suppression'
import { ouvrirFenetre } from '../outils/dom-react'

/**
 * Deleting her account from her space (ticket 141; plan 02 E33): what she retypes, the strict schema
 * of the request, and the dialog (nothing is sent without a confirmation, one request for a double
 * click or a held Enter, the message of a refusal keeps the dialog open). The send function is a
 * fake: no network.
 */

const fenetre = ouvrirFenetre()

describe('ce qu’elle retape', () => {
	test.each([
		[{ legacyProvider: 'google' }, 'email'],
		[{ legacyProvider: 'facebook' }, 'email'],
		[{ legacyProvider: 'local' }, 'mot-de-passe'],
		[{ legacyProvider: null }, 'mot-de-passe'],
		[{}, 'mot-de-passe'],
		[{ email: 'a@example.test' }, 'mot-de-passe'],
	] as [object, ModeDeConfirmation][])('%j : %s', (compte, attendu) => {
		expect(modeDeConfirmation(compte)).toBe(attendu)
	})
})

describe('le schéma du serveur est strict', () => {
	test.each([
		[{ confirmation: 'x' }, true],
		[{ confirmation: '' }, true],
		[{ confirmation: 'x'.repeat(CONFIRMATION_MAX) }, true],
		[{ confirmation: 'x'.repeat(CONFIRMATION_MAX + 1) }, false],
		[{ confirmation: 12 }, false],
		[{}, false],
		[{ confirmation: 'x', id: 4 }, false],
		[{ confirmation: 'x', pro: 4 }, false],
	])('%j accepté : %p', (saisie, accepte) => {
		expect(schemaDeLaSuppression.safeParse(saisie).success).toBe(accepte)
	})
})

function monter(
	mode: 'mot-de-passe' | 'email',
	envoyer: EnvoiDeLaSuppression,
	aller: (adresse: string) => void = () => {}
) {
	return fenetre.monter(<SuppressionDuCompte mode={mode} envoyer={envoyer} aller={aller} />)
}
const ouvrir = () => fenetre.cliquer(fenetre.bouton('Supprimer mon compte'))
const dialogue = () => fenetre.w.document.querySelector('[role="dialog"]')
const confirmer = () => fenetre.bouton('Supprimer définitivement mon compte')
const alerte = () => fenetre.w.document.querySelector('[role="alert"]')?.textContent ?? ''

describe('la fenêtre de suppression', () => {
	test('elle ne s’ouvre qu’au clic ; elle dit ce qui part, demande le mot de passe, et le bouton attend la saisie', async () => {
		await monter('mot-de-passe', async () => ({ ok: true }))
		expect(dialogue()).toBeNull()

		await ouvrir()

		expect(dialogue()?.textContent).toContain('toutes tes photos seront supprimés pour toujours')
		const champ = fenetre.champ('Retape ton mot de passe pour confirmer')
		expect((champ as HTMLInputElement).type).toBe('password')
		expect(champ.getAttribute('autocomplete')).toBe('current-password')
		expect(confirmer().hasAttribute('disabled')).toBe(true)
	})

	test('un compte sans mot de passe retape son adresse email', async () => {
		await monter('email', async () => ({ ok: true }))
		await ouvrir()

		const champ = fenetre.champ('Retape l’adresse email de ton compte pour confirmer') as HTMLInputElement
		expect(champ.type).toBe('email')
	})

	test('la saisie part telle quelle, une seule fois, puis le navigateur quitte l’espace', async () => {
		const appels: unknown[] = []
		const allees: string[] = []
		await monter(
			'mot-de-passe',
			async valeurs => {
				appels.push(valeurs)
				return { ok: true }
			},
			adresse => allees.push(adresse)
		)
		await ouvrir()
		await fenetre.saisir(fenetre.champ('Retape ton mot de passe pour confirmer'), 'mon secret fictif')

		await fenetre.cliquer(confirmer())

		expect(appels).toEqual([{ confirmation: 'mon secret fictif' }])
		expect(allees).toEqual(['/'])
		expect(fenetre.w.document.querySelector('[role="status"]')?.textContent).toBe('Ton compte est supprimé.')
	})

	test('un refus : la fenêtre reste ouverte avec son message, la saisie est gardée, rien n’est quitté', async () => {
		const allees: string[] = []
		await monter(
			'mot-de-passe',
			async () => ({ ok: false, message: MESSAGES_DE_SUPPRESSION.motDePasse }),
			a => allees.push(a)
		)
		await ouvrir()
		await fenetre.saisir(fenetre.champ('Retape ton mot de passe pour confirmer'), 'faux')

		await fenetre.cliquer(confirmer())

		expect(alerte()).toBe(MESSAGES_DE_SUPPRESSION.motDePasse)
		expect((fenetre.champ('Retape ton mot de passe pour confirmer') as HTMLInputElement).value).toBe('faux')
		expect(allees).toEqual([])
		expect(confirmer().hasAttribute('disabled')).toBe(false)
	})

	test('une fonction d’envoi qui lève : le message du site, la fenêtre reste ouverte', async () => {
		await monter('mot-de-passe', async () => {
			throw new Error('Failed to fetch')
		})
		await ouvrir()
		await fenetre.saisir(fenetre.champ('Retape ton mot de passe pour confirmer'), 'x')

		await fenetre.cliquer(confirmer())

		expect(alerte()).toBe(MESSAGES_DE_SUPPRESSION.echec)
	})

	test('pendant l’envoi tout est verrouillé : deux clics et une touche Entrée répétée, une seule requête', async () => {
		let appels = 0
		let finir: () => void = () => undefined
		await monter('mot-de-passe', () => {
			appels += 1
			return new Promise(fin => {
				finir = () => fin({ ok: false, message: MESSAGES_DE_SUPPRESSION.motDePasse })
			})
		})
		await ouvrir()
		await fenetre.saisir(fenetre.champ('Retape ton mot de passe pour confirmer'), 'x')

		const bouton = confirmer()
		let repetee: Event | undefined
		await act(async () => {
			bouton.click()
			bouton.click()
			repetee = new fenetre.w.KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true })
			fenetre.champ('Retape ton mot de passe pour confirmer').dispatchEvent(repetee)
		})
		expect(appels).toBe(1)
		expect(repetee?.defaultPrevented).toBe(true)
		expect(bouton.hasAttribute('disabled')).toBe(true)
		await act(async () => finir())

		expect(appels).toBe(1)
		expect(bouton.hasAttribute('disabled')).toBe(false)
	})

	test('Escape ferme la fenêtre sans rien envoyer', async () => {
		let appels = 0
		await monter('mot-de-passe', async () => {
			appels += 1
			return { ok: true }
		})
		await ouvrir()
		await act(async () => {
			dialogue()?.dispatchEvent(
				new fenetre.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
			)
		})

		expect(dialogue()).toBeNull()
		expect(appels).toBe(0)
	})
})
