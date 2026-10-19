import { describe, expect, test } from 'bun:test'
import { authLogRow, EVENT_METHODS } from '@/lib/auth/auth-log'
import { errorMessage, GOOGLE_ERROR_CODES, urlError, urlMessage } from '@/lib/auth/errors'
import { safeReturnTo } from '@/lib/auth/return-to'

/** The messages of the Google sign-in and its place in the journal (tickets 090 and 091). */

describe('?error= : une liste fermée, jamais ce qui est écrit dans l’adresse', () => {
	test('chaque code de Google a un message en français, sans adresse ni jargon', () => {
		for (const code of GOOGLE_ERROR_CODES) {
			const message = urlMessage(code)
			expect(message).toMatch(/[a-zé]{4,}/)
			expect(message).not.toMatch(/oauth|token|jeton|invalid|error/i)
			expect(urlError(code)?.code).toBe(code)
		}
	})

	test('chaque cas a son code et son message : annulation, panne, mot de passe, blocage', () => {
		const messages = GOOGLE_ERROR_CODES.map(code => urlMessage(code))
		expect(new Set(messages).size).toBe(GOOGLE_ERROR_CODES.length)
		expect(urlMessage('google-annule')).toContain('annulé')
		expect(urlMessage('google-indisponible')).toContain('ne répond pas')
		expect(urlMessage('email-deja-avec-mot-de-passe')).toContain('déjà un compte avec un mot de passe')
		expect(urlMessage('compte-bloque')).toBe(errorMessage('compte-bloque'))
	})

	test('l’email non vérifié a son propre message', () => {
		expect(urlMessage('google-email-non-verifie')).toContain('Google n’a pas confirmé ton adresse email')
	})

	test('un code inconnu, un texte glissé dans l’adresse ou une liste ne montrent rien', () => {
		for (const brut of [
			'google-inconnu',
			'<b>google-echec</b>',
			'lea@example.test',
			'',
			undefined,
			3,
			['google-echec-x'],
		])
			expect(urlMessage(brut)).toBeNull()
	})

	test('la session expirée garde son message', () => {
		expect(urlMessage('session-expiree')).toBe('Ta session a expiré, reconnecte-toi.')
		expect(urlError(['session-expiree'])?.code).toBe('session-expiree')
	})
})

describe('le journal garde la méthode, dans une liste fermée', () => {
	test('google et mot de passe sont écrits, tout le reste est ignoré', () => {
		expect(EVENT_METHODS).toEqual(['password', 'google'])
		expect(authLogRow({ type: 'sign-in', code: 'ok', method: 'google' }).method).toBe('google')
		const glisse = 'lea@example.test' as unknown as 'google'
		expect('method' in authLogRow({ type: 'sign-in', code: 'ok', method: glisse })).toBe(false)
		expect('method' in authLogRow({ type: 'sign-out', code: 'ok' })).toBe(false)
	})
})

describe('le retour après Google', () => {
	test('la porte de départ de Google n’est jamais une page de retour : elle ferait une boucle', () => {
		expect(safeReturnTo('/auth/google', 'https://my-makeup.fr')).toBe('/auth/profil')
		expect(safeReturnTo('/auth/google/callback?code=x', 'https://my-makeup.fr')).toBe('/auth/profil')
	})
})
