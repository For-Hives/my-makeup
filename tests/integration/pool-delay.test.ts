import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test'
import type { Payload } from 'payload'
import { GET as sante } from '@/app/api/health/route'
import { CONNECTION_TIMEOUT_MS } from '@/lib/pool-base'
import { testPayload } from '../support/payload-test'

/**
 * Ticket 222: when every connection of the pool is taken and kept, one more query fails within the
 * wait limit instead of waiting for ever, and the application answers again once they are back.
 */

let payload: Payload
const guarded: { release: () => void }[] = []

beforeAll(async () => {
	payload = await testPayload()
})

afterAll(() => {
	for (const signIn of guarded.splice(0)) signIn.release()
})

describe('le pool de la base ne bloque pas pour toujours (ticket 222)', () => {
	test('le pool de Payload porte le délai', () => {
		expect(payload.db.pool.options.connectionTimeoutMillis).toBe(CONNECTION_TIMEOUT_MS)
	})

	test('toutes les connexions prises : une requête de plus échoue dans le délai, puis l’application répond', async () => {
		// Take every connection that is free: the ones Payload already holds count as taken.
		const { options, totalCount, idleCount } = payload.db.pool
		const free = (options.max ?? 10) - (totalCount - idleCount)
		for (let i = 0; i < free; i++) guarded.push(await payload.db.pool.connect())

		const start = performance.now()
		await expect(payload.db.pool.query('SELECT 1')).rejects.toThrow(/timeout/i)
		const duration = performance.now() - start
		expect(duration).toBeGreaterThanOrEqual(CONNECTION_TIMEOUT_MS - 200)
		expect(duration).toBeLessThan(CONNECTION_TIMEOUT_MS + 3000)

		for (const signIn of guarded.splice(0)) signIn.release()
		const response = await sante()
		expect(response.status).toBe(200)
	}, 20_000)
})

describe('une connexion inactive coupée ne tue pas le serveur (ticket 223)', () => {
	test('le pool de Payload écoute « error » : l’événement ne lève pas, une ligne courte sans adresse de base', () => {
		expect(payload.db.pool.listenerCount('error')).toBeGreaterThanOrEqual(1)
		const lines: string[] = []
		const spy = spyOn(payload.logger, 'warn').mockImplementation(((ligne: unknown) => {
			lines.push(String(ligne))
		}) as never)
		try {
			const error = Object.assign(new Error(`connect ECONNREFUSED ${new URL(process.env.DATABASE_URI ?? '').host}`), {
				code: 'ECONNREFUSED',
			})
			expect(() => payload.db.pool.emit('error', error)).not.toThrow()
		} finally {
			spy.mockRestore()
		}
		expect(lines).toHaveLength(1)
		expect(lines[0]).toContain('ECONNREFUSED')
		expect(lines[0]).not.toContain(new URL(process.env.DATABASE_URI ?? '').host)
	})

	test('une vraie coupure : PostgreSQL met fin aux connexions inactives, le pool les perd et l’application répond encore', async () => {
		// Two connections taken, one given back: it sits idle in the pool, as one does between two requests.
		const first = await payload.db.pool.connect()
		const second = await payload.db.pool.connect()
		second.release()
		expect(payload.db.pool.idleCount).toBeGreaterThanOrEqual(1)
		const spy = spyOn(payload.logger, 'warn').mockImplementation((() => undefined) as never)
		try {
			// What `docker stop` does to an idle connection: the server ends every other session.
			await first.query(
				'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND datname = current_database()'
			)
			await new Promise(resolve => setTimeout(resolve, 300))
			expect(spy).toHaveBeenCalled()
		} finally {
			first.release()
			spy.mockRestore()
		}
		// The process is alive (this line runs), and the next query opens a new connection.
		expect((await sante()).status).toBe(200)
	})
})
