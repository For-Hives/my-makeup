import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { GET as sante } from '@/app/api/health/route'
import { DELAI_CONNEXION_MS } from '@/lib/pool-base'
import { payloadDeTest } from '../outils/payload-test'

/**
 * Ticket 222: when every connection of the pool is taken and kept, one more query fails within the
 * wait limit instead of waiting for ever, and the application answers again once they are back.
 */

let payload: Payload
const gardees: { release: () => void }[] = []

beforeAll(async () => {
	payload = await payloadDeTest()
})

afterAll(() => {
	for (const connexion of gardees.splice(0)) connexion.release()
})

describe('le pool de la base ne bloque pas pour toujours (ticket 222)', () => {
	test('le pool de Payload porte le délai', () => {
		expect(payload.db.pool.options.connectionTimeoutMillis).toBe(DELAI_CONNEXION_MS)
	})

	test('toutes les connexions prises : une requête de plus échoue dans le délai, puis l’application répond', async () => {
		// Take every connection that is free: the ones Payload already holds count as taken.
		const { options, totalCount, idleCount } = payload.db.pool
		const libres = (options.max ?? 10) - (totalCount - idleCount)
		for (let i = 0; i < libres; i++) gardees.push(await payload.db.pool.connect())

		const debut = performance.now()
		await expect(payload.db.pool.query('SELECT 1')).rejects.toThrow(/timeout/i)
		const duree = performance.now() - debut
		expect(duree).toBeGreaterThanOrEqual(DELAI_CONNEXION_MS - 200)
		expect(duree).toBeLessThan(DELAI_CONNEXION_MS + 3000)

		for (const connexion of gardees.splice(0)) connexion.release()
		const reponse = await sante()
		expect(reponse.status).toBe(200)
	}, 20_000)
})
