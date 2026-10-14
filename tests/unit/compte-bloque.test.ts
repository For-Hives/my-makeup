import { describe, expect, test } from 'bun:test'
import { APIError, AuthenticationError } from 'payload'
import { CompteBloque, fermerLesSessionsAuBlocage, refuserUnCompteBloque } from '@/lib/auth/compte-bloque'
import { codeDeLEchec } from '@/lib/auth/connexion'
import { CODES_ERREUR, messageErreur } from '@/lib/auth/erreurs'
import { CODES_EVENEMENT, TYPES_EVENEMENT } from '@/lib/auth/journal'

const t = ((cle: string) => cle) as never

describe('le compte bloqué (ticket 089)', () => {
	test('son refus a son code, son message français et le statut 403', () => {
		const erreur = new CompteBloque()
		expect(erreur).toBeInstanceOf(APIError)
		expect(erreur.status).toBe(403)
		expect(codeDeLEchec(erreur)).toBe('compte-bloque')
		expect(CODES_ERREUR).toContain('compte-bloque')
		expect(messageErreur('compte-bloque')).toBe(
			'Ce compte est bloqué. Écris-nous depuis la page contact pour en savoir plus.'
		)
	})

	test('un mot de passe faux garde le code générique', () => {
		expect(codeDeLEchec(new AuthenticationError(t))).toBe('identifiants-invalides')
	})

	test('le journal connaît le refus et les deux changements du blocage', () => {
		expect(CODES_EVENEMENT).toContain('compte-bloque')
		expect(TYPES_EVENEMENT).toContain('blocage')
		expect(TYPES_EVENEMENT).toContain('deblocage')
	})

	test('beforeLogin refuse un compte bloqué et laisse passer les autres', async () => {
		const appel = (bloque: unknown) =>
			(refuserUnCompteBloque as unknown as (args: unknown) => unknown)({ user: { id: 1, bloque } })
		expect(() => appel(true)).toThrow(CompteBloque)
		expect(appel(false)).toEqual({ id: 1, bloque: false })
		expect(appel(undefined)).toEqual({ id: 1, bloque: undefined })
	})

	test('le blocage vide les sessions une seule fois, au passage de libre à bloqué', () => {
		const jouer = (data: Record<string, unknown>, operation: string, originalDoc?: unknown) =>
			(fermerLesSessionsAuBlocage as unknown as (args: unknown) => Record<string, unknown>)({
				data,
				operation,
				originalDoc,
			})
		expect(jouer({ bloque: true }, 'update', { bloque: false })).toEqual({ bloque: true, sessions: [] })
		expect(jouer({ bloque: true }, 'update', { bloque: true })).toEqual({ bloque: true })
		expect(jouer({ nom: 'x' }, 'update', { bloque: false })).toEqual({ nom: 'x' })
		expect(jouer({ bloque: false }, 'update', { bloque: true })).toEqual({ bloque: false })
	})
})
