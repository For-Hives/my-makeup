import { describe, expect, test } from 'bun:test'
import { CONNEXIONS_MAX, DELAI_CONNEXION_MS, reglagesDuPool } from '@/lib/pool-base'

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
