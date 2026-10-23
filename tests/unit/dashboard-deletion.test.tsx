import { describe, expect, test } from 'bun:test'
import { act } from 'react'
import { AccountDeletion, type DeletionUpload } from '@/components/dashboard/AccountDeletion'
import {
	CONFIRMATION_MAX,
	type ConfirmationMode,
	confirmationMode,
	DELETION_MESSAGES,
	deletionSchema,
} from '@/lib/dashboard/deletion-confirmation'
import { openWindow } from '../support/dom-react'

/**
 * Deleting her account from her space (ticket 141; plan 02 E33): what she retypes, the strict schema
 * of the request, and the dialog (nothing is sent without a confirmation, one request for a double
 * click or a held Enter, the message of a refusal keeps the dialog open). The send function is a
 * fake: no network.
 */

const jsdomWindow = openWindow()

describe('ce qu’elle retape', () => {
	test.each([
		[{ legacyProvider: 'google' }, 'email'],
		[{ legacyProvider: 'facebook' }, 'email'],
		[{ legacyProvider: 'local' }, 'mot-de-passe'],
		[{ legacyProvider: null }, 'mot-de-passe'],
		[{}, 'mot-de-passe'],
		[{ email: 'a@example.test' }, 'mot-de-passe'],
	] as [object, ConfirmationMode][])('%j : %s', (compte, attendu) => {
		expect(confirmationMode(compte)).toBe(attendu)
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
		expect(deletionSchema.safeParse(saisie).success).toBe(accepte)
	})
})

function mount(mode: 'mot-de-passe' | 'email', envoyer: DeletionUpload, aller: (adresse: string) => void = () => {}) {
	return jsdomWindow.monter(<AccountDeletion mode={mode} envoyer={envoyer} aller={aller} />)
}
const open = () => jsdomWindow.cliquer(jsdomWindow.bouton('Supprimer mon compte'))
const dialogue = () => jsdomWindow.w.document.querySelector('[role="dialog"]')
const confirm = () => jsdomWindow.bouton('Supprimer définitivement mon compte')
const alert = () => jsdomWindow.w.document.querySelector('[role="alert"]')?.textContent ?? ''

describe('la fenêtre de suppression', () => {
	test('elle ne s’ouvre qu’au clic ; elle dit ce qui part, demande le mot de passe, et le bouton attend la saisie', async () => {
		await mount('mot-de-passe', async () => ({ ok: true }))
		expect(dialogue()).toBeNull()

		await open()

		expect(dialogue()?.textContent).toContain('toutes tes photos seront supprimés pour toujours')
		const field = jsdomWindow.champ('Retape ton mot de passe pour confirmer')
		expect((field as HTMLInputElement).type).toBe('password')
		expect(field.getAttribute('autocomplete')).toBe('current-password')
		expect(confirm().hasAttribute('disabled')).toBe(true)
	})

	test('un compte sans mot de passe retape son adresse email', async () => {
		await mount('email', async () => ({ ok: true }))
		await open()

		const field = jsdomWindow.champ('Retape l’adresse email de ton compte pour confirmer') as HTMLInputElement
		expect(field.type).toBe('email')
	})

	test('la saisie part telle quelle, une seule fois, puis le navigateur quitte l’espace', async () => {
		const calls: unknown[] = []
		const gone: string[] = []
		await mount(
			'mot-de-passe',
			async valeurs => {
				calls.push(valeurs)
				return { ok: true }
			},
			adresse => gone.push(adresse)
		)
		await open()
		await jsdomWindow.saisir(jsdomWindow.champ('Retape ton mot de passe pour confirmer'), 'mon secret fictif')

		await jsdomWindow.cliquer(confirm())

		expect(calls).toEqual([{ confirmation: 'mon secret fictif' }])
		expect(gone).toEqual(['/'])
		expect(jsdomWindow.w.document.querySelector('[role="status"]')?.textContent).toBe('Ton compte est supprimé.')
	})

	test('un refus : la fenêtre reste ouverte avec son message, la saisie est gardée, rien n’est quitté', async () => {
		const gone: string[] = []
		await mount(
			'mot-de-passe',
			async () => ({ ok: false, message: DELETION_MESSAGES.motDePasse }),
			a => gone.push(a)
		)
		await open()
		await jsdomWindow.saisir(jsdomWindow.champ('Retape ton mot de passe pour confirmer'), 'faux')

		await jsdomWindow.cliquer(confirm())

		expect(alert()).toBe(DELETION_MESSAGES.motDePasse)
		expect((jsdomWindow.champ('Retape ton mot de passe pour confirmer') as HTMLInputElement).value).toBe('faux')
		expect(gone).toEqual([])
		expect(confirm().hasAttribute('disabled')).toBe(false)
	})

	test('une fonction d’envoi qui lève : le message du site, la fenêtre reste ouverte', async () => {
		await mount('mot-de-passe', async () => {
			throw new Error('Failed to fetch')
		})
		await open()
		await jsdomWindow.saisir(jsdomWindow.champ('Retape ton mot de passe pour confirmer'), 'x')

		await jsdomWindow.cliquer(confirm())

		expect(alert()).toBe(DELETION_MESSAGES.echec)
	})

	test('pendant l’envoi tout est verrouillé : deux clics et une touche Entrée répétée, une seule requête', async () => {
		let calls = 0
		let finish: () => void = () => undefined
		await mount('mot-de-passe', () => {
			calls += 1
			return new Promise(fin => {
				finish = () => fin({ ok: false, message: DELETION_MESSAGES.motDePasse })
			})
		})
		await open()
		await jsdomWindow.saisir(jsdomWindow.champ('Retape ton mot de passe pour confirmer'), 'x')

		const button = confirm()
		let repeated: Event | undefined
		await act(async () => {
			button.click()
			button.click()
			repeated = new jsdomWindow.w.KeyboardEvent('keydown', {
				key: 'Enter',
				repeat: true,
				bubbles: true,
				cancelable: true,
			})
			jsdomWindow.champ('Retape ton mot de passe pour confirmer').dispatchEvent(repeated)
		})
		expect(calls).toBe(1)
		expect(repeated?.defaultPrevented).toBe(true)
		expect(button.hasAttribute('disabled')).toBe(true)
		await act(async () => finish())

		expect(calls).toBe(1)
		expect(button.hasAttribute('disabled')).toBe(false)
	})

	test('Escape ferme la fenêtre sans rien envoyer', async () => {
		let calls = 0
		await mount('mot-de-passe', async () => {
			calls += 1
			return { ok: true }
		})
		await open()
		await act(async () => {
			dialogue()?.dispatchEvent(
				new jsdomWindow.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
			)
		})

		expect(dialogue()).toBeNull()
		expect(calls).toBe(0)
	})
})
