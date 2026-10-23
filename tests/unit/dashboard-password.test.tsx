import { describe, expect, test } from 'bun:test'
import {
	PasswordChange,
	type PasswordChangeSend,
	type SetPasswordLinkSend,
} from '@/components/dashboard/PasswordChange'
import {
	CHANGE_MESSAGES,
	type PasswordChangeMode,
	passwordChangeMode,
	passwordChangeSchema,
} from '@/lib/dashboard/change-password'
import { composerEmail } from '@/lib/emails/layout'
import { passwordChangedEmailContent } from '@/lib/emails/password-changed'
import { openWindow } from '../support/dom-react'

/**
 * Changing the password from her space (ticket 999): who can type one, the strict schema of the request, the mail, and the
 * dialog (nothing is sent before the three fields are filled, one request for a double click, a refusal keeps the
 * dialog open and nothing typed is shown back). The send functions are fakes: no network. The rules with the
 * database are in tests/integration/change-password.test.ts.
 */

const jsdomWindow = openWindow()

describe('who can type a current password', () => {
	test.each([
		[{ legacyProvider: 'google' }, 'lien'],
		[{ legacyProvider: 'facebook' }, 'lien'],
		[{ legacyProvider: 'local', legacyBcrypt: '$2a$10$abcdefghijklmnopqrstuv' }, 'lien'],
		[{ legacyProvider: 'local' }, 'mot-de-passe'],
		[{ legacyProvider: null, legacyBcrypt: null }, 'mot-de-passe'],
		[{}, 'mot-de-passe'],
	] as [object, PasswordChangeMode][])('%j : %s', (compte, expected) => {
		expect(passwordChangeMode(compte)).toBe(expected)
	})
})

describe('the schema of the server is strict', () => {
	test.each([
		[{ current: 'a', password: 'b', confirmation: 'b' }, true],
		[{ current: 'a', password: 'b' }, false],
		[{ current: 'a', password: 'b', confirmation: 'b', id: 4 }, false],
		[{ current: 'a'.repeat(1025), password: 'b', confirmation: 'b' }, false],
		[{ current: 1, password: 'b', confirmation: 'b' }, false],
	])('%j accepted: %p', (saisie, accepted) => {
		expect(passwordChangeSchema.safeParse(saisie).success).toBe(accepted)
	})
})

describe('the mail', () => {
	test('says it changed, leads to the forgotten password, holds no token and says so in its footer', () => {
		const mail = composerEmail(passwordChangedEmailContent(), 'https://my-makeup.fr')
		expect(mail.lien).toBe('https://my-makeup.fr/auth/mot-de-passe-oublie')
		expect(mail.texte).toContain('Si ce n’est pas toi')
		expect(`${mail.texte}${mail.html}`).not.toMatch(/Tu n’as rien demandé/)
		expect(`${mail.texte}${mail.html}`).not.toMatch(/[?&](code|token)=/)
	})
})

function mount(
	mode: PasswordChangeMode,
	envoyer: PasswordChangeSend,
	demanderLien: SetPasswordLinkSend = async () => ({ ok: true, message: 'ok' }),
	reconnecter: (a: string) => void = () => {}
) {
	return jsdomWindow.monter(
		<PasswordChange mode={mode} envoyer={envoyer} demanderLien={demanderLien} reconnecter={reconnecter} />
	)
}
const open = () => jsdomWindow.cliquer(jsdomWindow.bouton('Changer mon mot de passe'))
const dialogue = () => jsdomWindow.w.document.querySelector('[role="dialog"]')
const confirm = () => jsdomWindow.bouton('Changer mon mot de passe', dialogue() ?? undefined)
const alert = () => jsdomWindow.w.document.querySelector('[role="alert"]')?.textContent ?? ''
const fill = async (current: string, password: string, confirmation: string) => {
	await jsdomWindow.saisir(jsdomWindow.champ('Ton mot de passe actuel'), current)
	await jsdomWindow.saisir(jsdomWindow.champ('Ton nouveau mot de passe'), password)
	await jsdomWindow.saisir(jsdomWindow.champ('Retape ton nouveau mot de passe'), confirmation)
}

describe('the dialog', () => {
	test('opens on click only, three password fields with the right autocomplete, the button waits for all three', async () => {
		await mount('mot-de-passe', async () => ({ ok: true, message: CHANGE_MESSAGES.ok }))
		expect(dialogue()).toBeNull()
		await open()
		for (const [label, auto] of [
			['Ton mot de passe actuel', 'current-password'],
			['Ton nouveau mot de passe', 'new-password'],
			['Retape ton nouveau mot de passe', 'new-password'],
		] as const) {
			const field = jsdomWindow.champ(label) as HTMLInputElement
			expect(field.type).toBe('password')
			expect(field.getAttribute('autocomplete')).toBe(auto)
		}
		expect(confirm().hasAttribute('disabled')).toBe(true)
		await jsdomWindow.saisir(jsdomWindow.champ('Ton mot de passe actuel'), 'a')
		expect(confirm().hasAttribute('disabled')).toBe(true)
	})

	test('sends what was typed once, then closes and says it worked', async () => {
		const calls: unknown[] = []
		await mount('mot-de-passe', async valeurs => {
			calls.push(valeurs)
			return { ok: true, message: CHANGE_MESSAGES.ok }
		})
		await open()
		await fill('actuel fictif', 'nouveau fictif', 'nouveau fictif')
		await jsdomWindow.cliquer(confirm())
		expect(calls).toEqual([{ current: 'actuel fictif', password: 'nouveau fictif', confirmation: 'nouveau fictif' }])
		expect(dialogue()).toBeNull()
		expect(jsdomWindow.w.document.querySelector('[data-testid="mot-de-passe-statut"]')?.textContent).toBe(
			CHANGE_MESSAGES.ok
		)
		expect(jsdomWindow.w.document.body.innerHTML).not.toContain('nouveau fictif')
	})

	test('a refusal keeps the dialog open with its message and never shows a password back', async () => {
		await mount('mot-de-passe', async () => ({ ok: false, code: 'actuel', message: CHANGE_MESSAGES.actuel }))
		await open()
		await fill('faux fictif', 'nouveau fictif', 'nouveau fictif')
		await jsdomWindow.cliquer(confirm())
		expect(alert()).toBe(CHANGE_MESSAGES.actuel)
		expect(dialogue()).not.toBeNull()
		expect(alert()).not.toContain('fictif')
	})

	test('an expired session sends her to the sign-in', async () => {
		const gone: string[] = []
		await mount(
			'mot-de-passe',
			async () => ({ ok: false, code: 'session', message: CHANGE_MESSAGES.session, session: 'expiree' }),
			undefined,
			a => gone.push(a)
		)
		await open()
		await fill('a', 'nouveau fictif', 'nouveau fictif')
		await jsdomWindow.cliquer(confirm())
		expect(gone).toEqual(['/auth/signin'])
	})

	test('a send function that throws: the message of the site, the dialog stays', async () => {
		await mount('mot-de-passe', async () => {
			throw new Error('réseau')
		})
		await open()
		await fill('a', 'nouveau fictif', 'nouveau fictif')
		await jsdomWindow.cliquer(confirm())
		expect(alert()).toBe(CHANGE_MESSAGES.echec)
	})
})

describe('an account with no password she knows', () => {
	test('has no fields: a button « Définir un mot de passe » asks for the link by email', async () => {
		let asked = 0
		await mount(
			'lien',
			async () => ({ ok: true, message: '' }),
			async () => {
				asked += 1
				return { ok: true, message: CHANGE_MESSAGES.lienEnvoye }
			}
		)
		expect(jsdomWindow.w.document.body.textContent).not.toContain('Changer mon mot de passe')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Définir un mot de passe'))
		expect(asked).toBe(1)
		expect(dialogue()).toBeNull()
		expect(jsdomWindow.w.document.querySelector('[data-testid="mot-de-passe-statut"]')?.textContent).toBe(
			CHANGE_MESSAGES.lienEnvoye
		)
	})
})
