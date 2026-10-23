import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { errorMessage } from '@/lib/auth/errors'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'

/**
 * Ticket 223, findings 4 and 10: the level at which Payload writes a refusal that is a normal event.
 * The weekly report counts the error-level lines (decisions 2026-10-13): a blocked account that gives
 * its password, or a malformed identifier in the address, must not count.
 */

afterAll(async () => {
	await emptyBase()
})

type Level = 'error' | 'warn' | 'info'
const calls: Record<Level, unknown[][]> = { error: [], warn: [], info: [] }
let spies: ReturnType<typeof spyOn>[] = []

beforeEach(async () => {
	const { logger } = await testPayload()
	for (const level of ['error', 'warn', 'info'] as const) {
		calls[level] = []
		spies.push(spyOn(logger, level).mockImplementation((...args: unknown[]) => void calls[level].push(args)))
	}
})
afterEach(() => {
	for (const spy of spies.splice(0)) spy.mockRestore()
	spies = []
})

const text = (lignes: unknown[][]): string => JSON.stringify(lignes)

describe('constat 4 : un compte bloqué qui donne son mot de passe est une ligne d’information', () => {
	test('POST /api/pros/login : 403, une ligne info avec le message, aucune ligne error', async () => {
		const PASSWORD = 'aaaaaaaa'
		const account = await createAccount('maquilleuse-bloquee', { motDePasse: () => PASSWORD })

		const { statut: status } = await callRest('POST', '/api/pros/login', {
			corps: { email: account.email, password: PASSWORD },
			enTetes: { 'x-forwarded-for': '192.0.2.77' },
		})

		expect(status).toBe(403)
		expect(text(calls.info)).toContain(errorMessage('compte-bloque'))
		expect(calls.error).toEqual([])
	})
})

describe('constat 10 : « Missing ID » de Payload est une ligne d’information', () => {
	// A plain APIError: info on the source and, through the logError patch (patches/payload@3.90.2.patch), on the minified build too.
	test('PATCH /api/pros/abc : 400 avant toute règle, aucune ligne error', async () => {
		const admin = await createAccount('admin')

		const { statut: status } = await callRest('PATCH', '/api/pros/abc', {
			corps: { bloque: true },
			enTetes: admin.session.enTetes,
		})

		expect(status).toBe(400)
		expect(text(calls.info)).toContain('Missing ID')
		expect(calls.error).toEqual([])
	})
})
