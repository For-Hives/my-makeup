import { describe, expect, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import { CONNEXIONS_MAX, DELAI_CONNEXION_MS, ecouterLePool, reglagesDuPool } from '@/lib/pool-base'

describe('le pool de la base a un délai d’attente de connexion (ticket 222)', () => {
	test('les réglages portent la chaîne de connexion, 5 connexions et un délai de quelques secondes', () => {
		expect(reglagesDuPool('postgres://exemple.test/base')).toEqual({
			connectionString: 'postgres://exemple.test/base',
			connectionTimeoutMillis: DELAI_CONNEXION_MS,
			max: CONNEXIONS_MAX,
		})
		expect(CONNEXIONS_MAX).toBe(5)
		expect(DELAI_CONNEXION_MS).toBeGreaterThanOrEqual(2000)
		expect(DELAI_CONNEXION_MS).toBeLessThanOrEqual(10_000)
	})
})

describe('une connexion inactive coupée ne tue pas le serveur (ticket 223)', () => {
	test('sans écouteur, l’événement « error » d’un pool lève : c’est ce qui arrêtait le processus', () => {
		const pool = new EventEmitter()
		expect(() => pool.emit('error', new Error('terminating connection'))).toThrow()
	})

	test('avec l’écouteur, une ligne courte avec le code, jamais le message ni l’adresse de la base', () => {
		const pool = new EventEmitter()
		const lignes: string[] = []
		ecouterLePool(pool, ligne => lignes.push(ligne))

		const erreur = Object.assign(new Error('connect ECONNREFUSED 10.20.30.40:5432'), { code: 'ECONNREFUSED' })
		expect(() => pool.emit('error', erreur)).not.toThrow()
		expect(() => pool.emit('error', new Error('sans code'))).not.toThrow()

		expect(lignes).toHaveLength(2)
		expect(lignes[0]).toContain('ECONNREFUSED')
		expect(lignes[1]).toContain('inconnu')
		for (const ligne of lignes) {
			expect(ligne).not.toContain('10.20.30.40')
			expect(ligne).not.toContain('5432')
			expect(ligne.length).toBeLessThan(160)
		}
	})

	test('une seule écoute par pool, même si Payload démarre plusieurs fois', () => {
		const pool = new EventEmitter()
		const lignes: string[] = []
		ecouterLePool(pool, ligne => lignes.push(ligne))
		ecouterLePool(pool, ligne => lignes.push(ligne))
		pool.emit('error', new Error('x'))
		expect(pool.listenerCount('error')).toBe(1)
		expect(lignes).toHaveLength(1)
	})
})
