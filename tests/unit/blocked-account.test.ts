import { describe, expect, test } from 'bun:test'
import { APIError, AuthenticationError } from 'payload'
import { EVENT_CODES, EVENT_TYPES } from '@/lib/auth/auth-log'
import { BlockedAccount, closeSessionsOnBlock, refuseBlockedAccount } from '@/lib/auth/blocked-account'
import { ERROR_CODES, errorMessage } from '@/lib/auth/errors'
import { failureCode } from '@/lib/auth/sign-in'

const t = ((cle: string) => cle) as never

describe('le compte bloqué (ticket 089)', () => {
	test('son refus a son code, son message français et le statut 403', () => {
		const error = new BlockedAccount()
		expect(error).toBeInstanceOf(APIError)
		expect(error.status).toBe(403)
		expect(failureCode(error)).toBe('compte-bloque')
		expect(ERROR_CODES).toContain('compte-bloque')
		expect(errorMessage('compte-bloque')).toBe(
			'Ce compte est bloqué. Écris-nous depuis la page contact pour en savoir plus.'
		)
	})

	test('un mot de passe faux garde le code générique', () => {
		expect(failureCode(new AuthenticationError(t))).toBe('identifiants-invalides')
	})

	test('le journal connaît le refus et les deux changements du blocage', () => {
		expect(EVENT_CODES).toContain('compte-bloque')
		expect(EVENT_TYPES).toContain('block')
		expect(EVENT_TYPES).toContain('unblock')
	})

	test('beforeLogin refuse un compte bloqué et laisse passer les autres', async () => {
		const call = (bloque: unknown) =>
			(refuseBlockedAccount as unknown as (args: unknown) => unknown)({ user: { id: 1, blocked: bloque } })
		expect(() => call(true)).toThrow(BlockedAccount)
		expect(call(false)).toEqual({ id: 1, blocked: false })
		expect(call(undefined)).toEqual({ id: 1, blocked: undefined })
	})

	test('le blocage vide les sessions une seule fois, au passage de libre à bloqué', () => {
		const run = (data: Record<string, unknown>, operation: string, originalDoc?: unknown) =>
			(closeSessionsOnBlock as unknown as (args: unknown) => Record<string, unknown>)({
				data,
				operation,
				originalDoc,
			})
		expect(run({ blocked: true }, 'update', { blocked: false })).toEqual({ blocked: true, sessions: [] })
		expect(run({ blocked: true }, 'update', { blocked: true })).toEqual({ blocked: true })
		expect(run({ nom: 'x' }, 'update', { blocked: false })).toEqual({ nom: 'x' })
		expect(run({ blocked: false }, 'update', { blocked: true })).toEqual({ blocked: false })
	})
})
