import { describe, expect, test } from 'bun:test'
import { CODES_ERREUR_GOOGLE, erreurDeLUrl, messageDeLUrl } from '@/lib/auth/erreurs'
import { ligneDeJournal, METHODES_EVENEMENT } from '@/lib/auth/journal'
import { retourSur } from '@/lib/auth/retour'

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
		expect(METHODES_EVENEMENT).toEqual(['mot-de-passe', 'google'])
		expect(ligneDeJournal({ type: 'connexion', code: 'ok', methode: 'google' }).methode).toBe('google')
		const glisse = 'lea@example.test' as unknown as 'google'
		expect('methode' in ligneDeJournal({ type: 'connexion', code: 'ok', methode: glisse })).toBe(false)
		expect('methode' in ligneDeJournal({ type: 'deconnexion', code: 'ok' })).toBe(false)
	})
})

describe('le retour après Google', () => {
	test('la porte de départ de Google n’est jamais une page de retour : elle ferait une boucle', () => {
		expect(retourSur('/auth/google', 'https://my-makeup.fr')).toBe('/auth/profil')
		expect(retourSur('/auth/google/retour?code=x', 'https://my-makeup.fr')).toBe('/auth/profil')
	})
})
