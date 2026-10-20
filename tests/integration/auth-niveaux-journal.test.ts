import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { errorMessage } from '@/lib/auth/errors'
import { creerCompte } from '../support/account-factory'
import { payloadDeTest, viderLaBase } from '../support/payload-test'
import { appelerRest } from '../support/rest'

/**
 * Ticket 223, findings 4 and 10: the level at which Payload writes a refusal that is a normal event.
 * The weekly report counts the error-level lines (decisions 2026-10-13): a blocked account that gives
 * its password, or a malformed identifier in the address, must not count.
 */

afterAll(async () => {
	await viderLaBase()
})

type Niveau = 'error' | 'warn' | 'info'
const appels: Record<Niveau, unknown[][]> = { error: [], warn: [], info: [] }
let espions: ReturnType<typeof spyOn>[] = []

beforeEach(async () => {
	const { logger } = await payloadDeTest()
	for (const niveau of ['error', 'warn', 'info'] as const) {
		appels[niveau] = []
		espions.push(spyOn(logger, niveau).mockImplementation((...args: unknown[]) => void appels[niveau].push(args)))
	}
})
afterEach(() => {
	for (const espion of espions.splice(0)) espion.mockRestore()
	espions = []
})

const texte = (lignes: unknown[][]): string => JSON.stringify(lignes)

describe('constat 4 : un compte bloqué qui donne son mot de passe est une ligne d’information', () => {
	test('POST /api/pros/login : 403, une ligne info avec le message, aucune ligne error', async () => {
		const MOT_DE_PASSE = 'aaaaaaaa'
		const compte = await creerCompte('maquilleuse-bloquee', { motDePasse: () => MOT_DE_PASSE })

		const { statut } = await appelerRest('POST', '/api/pros/login', {
			corps: { email: compte.email, password: MOT_DE_PASSE },
			enTetes: { 'x-forwarded-for': '192.0.2.77' },
		})

		expect(statut).toBe(403)
		expect(texte(appels.info)).toContain(errorMessage('compte-bloque'))
		expect(appels.error).toEqual([])
	})
})

describe('constat 10 : « Missing ID » de Payload est une ligne d’information', () => {
	// A plain APIError: info on the source and, through the logError patch (patches/payload@3.90.2.patch), on the minified build too.
	test('PATCH /api/pros/abc : 400 avant toute règle, aucune ligne error', async () => {
		const admin = await creerCompte('admin')

		const { statut } = await appelerRest('PATCH', '/api/pros/abc', {
			corps: { bloque: true },
			enTetes: admin.session.enTetes,
		})

		expect(statut).toBe(400)
		expect(texte(appels.info)).toContain('Missing ID')
		expect(appels.error).toEqual([])
	})
})
