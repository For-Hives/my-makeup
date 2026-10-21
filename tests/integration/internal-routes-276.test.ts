import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'

/** Ticket 276 (audit 21/10/2026, m7 and m8). */

afterAll(async () => {
	await emptyBase()
})

let errors: unknown[][] = []
let spy: ReturnType<typeof spyOn> | undefined
beforeEach(async () => {
	const { logger } = await testPayload()
	errors = []
	spy = spyOn(logger, 'error').mockImplementation((...args: unknown[]) => void errors.push(args))
})
afterEach(() => spy?.mockRestore())

describe('m7 : un refus d’accès n’écrit aucune ligne error', () => {
	test('GET /api/pros sans session : 403, aucune ligne error', async () => {
		const { statut: status } = await callRest('GET', '/api/pros')
		expect(status).toBe(403)
		expect(errors).toEqual([])
	})
})

describe('m8 : /api/payload-migrations', () => {
	test.each([
		['sans session', undefined],
		['avec une session admin', 'admin'],
	])('GET %s : 404, aucune adresse interne dans le corps', async (_nom, role) => {
		const enTetes = role ? (await createAccount('admin')).session.enTetes : undefined
		const { statut: status, texte } = await callRest('GET', '/api/payload-migrations', { enTetes })
		expect(status).toBe(404)
		expect(texte).not.toContain('0.0.0.0')
		expect(texte).not.toContain('Cannot GET')
	})
})
