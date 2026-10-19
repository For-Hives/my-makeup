import { describe, expect, test } from 'bun:test'
import { CODES_ERREUR_GOOGLE, erreurDeLUrl, messageDeLUrl, messageErreur } from '@/lib/auth/errors'
import { ligneDeJournal, METHODES_EVENEMENT } from '@/lib/auth/auth-log'
import { retourSur } from '@/lib/auth/return-to'

/** The messages of the Google sign-in and its place in the journal (tickets 090 and 091). */

describe('?error= : une liste fermée, jamais ce qui est écrit dans l’adresse', () => {
	test('chaque code de Google a un message en français, sans adresse ni jargon', () => {
		for (const code of CODES_ERREUR_GOOGLE) {
			const message = messageDeLUrl(code)
			expect(message).toMatch(/[a-zé]{4,}/)
			expect(message).not.toMatch(/oauth|token|jeton|invalid|error/i)
			expect(erreurDeLUrl(code)?.code).toBe(code)
		}
	})

	test('chaque cas a son code et son message : annulation, panne, mot de passe, blocage', () => {
		const messages = CODES_ERREUR_GOOGLE.map(code => messageDeLUrl(code))
		expect(new Set(messages).size).toBe(CODES_ERREUR_GOOGLE.length)
		expect(messageDeLUrl('google-annule')).toContain('annulé')
		expect(messageDeLUrl('google-indisponible')).toContain('ne répond pas')
		expect(messageDeLUrl('email-deja-avec-mot-de-passe')).toContain('déjà un compte avec un mot de passe')
		expect(messageDeLUrl('compte-bloque')).toBe(messageErreur('compte-bloque'))
	})

	test('l’email non vérifié a son propre message', () => {
		expect(messageDeLUrl('google-email-non-verifie')).toContain('Google n’a pas confirmé ton adresse email')
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
			expect(messageDeLUrl(brut)).toBeNull()
	})

	test('la session expirée garde son message', () => {
		expect(messageDeLUrl('session-expiree')).toBe('Ta session a expiré, reconnecte-toi.')
		expect(erreurDeLUrl(['session-expiree'])?.code).toBe('session-expiree')
	})
})

describe('le journal garde la méthode, dans une liste fermée', () => {
	test('google et mot de passe sont écrits, tout le reste est ignoré', () => {
		expect(METHODES_EVENEMENT).toEqual(['password', 'google'])
		expect(ligneDeJournal({ type: 'sign-in', code: 'ok', method: 'google' }).method).toBe('google')
		const glisse = 'lea@example.test' as unknown as 'google'
		expect('method' in ligneDeJournal({ type: 'sign-in', code: 'ok', method: glisse })).toBe(false)
		expect('method' in ligneDeJournal({ type: 'sign-out', code: 'ok' })).toBe(false)
	})
})

describe('le retour après Google', () => {
	test('la porte de départ de Google n’est jamais une page de retour : elle ferait une boucle', () => {
		expect(retourSur('/auth/google', 'https://my-makeup.fr')).toBe('/auth/profil')
		expect(retourSur('/auth/google/callback?code=x', 'https://my-makeup.fr')).toBe('/auth/profil')
	})
})
