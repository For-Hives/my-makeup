import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test'
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

describe('une connexion inactive coupée ne tue pas le serveur (ticket 223)', () => {
	test('le pool de Payload écoute « error » : l’événement ne lève pas, une ligne courte sans adresse de base', () => {
		expect(payload.db.pool.listenerCount('error')).toBeGreaterThanOrEqual(1)
		const lignes: string[] = []
		const espion = spyOn(payload.logger, 'warn').mockImplementation(((ligne: unknown) => {
			lignes.push(String(ligne))
		}) as never)
		try {
			const erreur = Object.assign(new Error(`connect ECONNREFUSED ${new URL(process.env.DATABASE_URI ?? '').host}`), {
				code: 'ECONNREFUSED',
			})
			expect(() => payload.db.pool.emit('error', erreur)).not.toThrow()
		} finally {
			espion.mockRestore()
		}
		expect(lignes).toHaveLength(1)
		expect(lignes[0]).toContain('ECONNREFUSED')
		expect(lignes[0]).not.toContain(new URL(process.env.DATABASE_URI ?? '').host)
	})

	test('une vraie coupure : PostgreSQL met fin aux connexions inactives, le pool les perd et l’application répond encore', async () => {
		// Two connections taken, one given back: it sits idle in the pool, as one does between two requests.
		const premiere = await payload.db.pool.connect()
		const seconde = await payload.db.pool.connect()
		seconde.release()
		expect(payload.db.pool.idleCount).toBeGreaterThanOrEqual(1)
		const espion = spyOn(payload.logger, 'warn').mockImplementation((() => undefined) as never)
		try {
			// What `docker stop` does to an idle connection: the server ends every other session.
			await premiere.query(
				'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND datname = current_database()'
			)
			await new Promise(resolve => setTimeout(resolve, 300))
			expect(espion).toHaveBeenCalled()
		} finally {
			premiere.release()
			espion.mockRestore()
		}
		// The process is alive (this line runs), and the next query opens a new connection.
		expect((await sante()).status).toBe(200)
	})
})
