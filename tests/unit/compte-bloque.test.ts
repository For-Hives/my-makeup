import { describe, expect, test } from 'bun:test'
import { APIError, AuthenticationError } from 'payload'
import { CompteBloque, fermerLesSessionsAuBlocage, refuserUnCompteBloque } from '@/lib/auth/blocked-account'
import { codeDeLEchec } from '@/lib/auth/sign-in'
import { CODES_ERREUR, messageErreur } from '@/lib/auth/errors'
import { CODES_EVENEMENT, TYPES_EVENEMENT } from '@/lib/auth/auth-log'

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
		expect(TYPES_EVENEMENT).toContain('block')
		expect(TYPES_EVENEMENT).toContain('unblock')
	})

	test('beforeLogin refuse un compte bloqué et laisse passer les autres', async () => {
		const appel = (bloque: unknown) =>
			(refuserUnCompteBloque as unknown as (args: unknown) => unknown)({ user: { id: 1, blocked: bloque } })
		expect(() => appel(true)).toThrow(CompteBloque)
		expect(appel(false)).toEqual({ id: 1, blocked: false })
		expect(appel(undefined)).toEqual({ id: 1, blocked: undefined })
	})

	test('le blocage vide les sessions une seule fois, au passage de libre à bloqué', () => {
		const jouer = (data: Record<string, unknown>, operation: string, originalDoc?: unknown) =>
			(fermerLesSessionsAuBlocage as unknown as (args: unknown) => Record<string, unknown>)({
				data,
				operation,
				originalDoc,
			})
		expect(jouer({ blocked: true }, 'update', { blocked: false })).toEqual({ blocked: true, sessions: [] })
		expect(jouer({ blocked: true }, 'update', { blocked: true })).toEqual({ blocked: true })
		expect(jouer({ nom: 'x' }, 'update', { blocked: false })).toEqual({ nom: 'x' })
		expect(jouer({ blocked: false }, 'update', { blocked: true })).toEqual({ blocked: false })
	})
})
