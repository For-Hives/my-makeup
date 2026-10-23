import { describe, expect, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import {
	CONNECTION_TIMEOUT_MS,
	CONNECTION_TIMEOUT_RANGE,
	CONNECTIONS_MAX,
	CONNECTIONS_MAX_RANGE,
	listenToPool,
	poolSettings,
} from '@/lib/pool-base'

describe('le pool de la base a un délai d’attente de connexion (ticket 222)', () => {
	test('les réglages portent la chaîne de connexion, 10 connexions par défaut et un délai de quelques secondes', () => {
		expect(poolSettings('postgres://exemple.test/base')).toEqual({
			connectionString: 'postgres://exemple.test/base',
			connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
			max: CONNECTIONS_MAX,
		})
		// Ticket 268: the default is the 10 of `pg`, measured and written in src/lib/pool-base.ts.
		expect(CONNECTIONS_MAX).toBe(10)
		expect(CONNECTION_TIMEOUT_MS).toBeGreaterThanOrEqual(2000)
		expect(CONNECTION_TIMEOUT_MS).toBeLessThanOrEqual(10_000)
	})
})

describe('la taille du pool se règle, et ne se règle jamais en attente infinie (ticket 268)', () => {
	test('les réglages de l’environnement passent tels quels dans le pool', () => {
		expect(poolSettings('postgres://exemple.test/base', { max: 20, timeoutMs: 8000 })).toEqual({
			connectionString: 'postgres://exemple.test/base',
			connectionTimeoutMillis: 8000,
			max: 20,
		})
	})

	test('le défaut et le délai par défaut sont dans leurs bornes, et le délai ne peut pas valoir 0 (attente infinie de pg)', () => {
		expect(CONNECTIONS_MAX).toBeGreaterThanOrEqual(CONNECTIONS_MAX_RANGE.min)
		expect(CONNECTIONS_MAX).toBeLessThanOrEqual(CONNECTIONS_MAX_RANGE.max)
		expect(CONNECTION_TIMEOUT_MS).toBeGreaterThanOrEqual(CONNECTION_TIMEOUT_RANGE.min)
		expect(CONNECTION_TIMEOUT_MS).toBeLessThanOrEqual(CONNECTION_TIMEOUT_RANGE.max)
		expect(CONNECTION_TIMEOUT_RANGE.min).toBeGreaterThan(0)
	})
})

describe('une connexion inactive coupée ne tue pas le serveur (ticket 223)', () => {
	test('sans écouteur, l’événement « error » d’un pool lève : c’est ce qui arrêtait le processus', () => {
		const pool = new EventEmitter()
		expect(() => pool.emit('error', new Error('terminating connection'))).toThrow()
	})

	test('avec l’écouteur, une ligne courte avec le code, jamais le message ni l’adresse de la base', () => {
		const pool = new EventEmitter()
		const lines: string[] = []
		listenToPool(pool, ligne => lines.push(ligne))

		const error = Object.assign(new Error('connect ECONNREFUSED 10.20.30.40:5432'), { code: 'ECONNREFUSED' })
		expect(() => pool.emit('error', error)).not.toThrow()
		expect(() => pool.emit('error', new Error('sans code'))).not.toThrow()

		expect(lines).toHaveLength(2)
		expect(lines[0]).toContain('ECONNREFUSED')
		expect(lines[1]).toContain('inconnu')
		for (const line of lines) {
			expect(line).not.toContain('10.20.30.40')
			expect(line).not.toContain('5432')
			expect(line.length).toBeLessThan(160)
		}
	})

	test('une seule écoute par pool, même si Payload démarre plusieurs fois', () => {
		const pool = new EventEmitter()
		const lines: string[] = []
		listenToPool(pool, ligne => lines.push(ligne))
		listenToPool(pool, ligne => lines.push(ligne))
		pool.emit('error', new Error('x'))
		expect(pool.listenerCount('error')).toBe(1)
		expect(lines).toHaveLength(1)
	})
})
