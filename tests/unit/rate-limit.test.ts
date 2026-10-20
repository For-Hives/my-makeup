import { beforeEach, describe, expect, test } from 'bun:test'
import { createRateLimit } from '@/lib/auth/rate-limit'

const MIN = 60_000
const rateLimit = createRateLimit({ nom: 'essai-frein', limite: 10, fenetreMs: 15 * MIN })
beforeEach(() => rateLimit.vider())

describe('le frein par adresse', () => {
	test('dix places passent, la onzième est refusée avec le temps d’attente', () => {
		for (let i = 0; i < 10; i++) expect(rateLimit.prendre('a', i * 1000).autorise).toBe(true)
		const eleventh = rateLimit.prendre('a', 10_000)
		expect(eleventh).toEqual({ autorise: false, reessayerDansS: 15 * 60 - 10 + 0 })
	})

	test('une autre adresse est libre', () => {
		for (let i = 0; i < 10; i++) rateLimit.prendre('a', 0)
		expect(rateLimit.prendre('a', 1).autorise).toBe(false)
		expect(rateLimit.prendre('b', 1).autorise).toBe(true)
	})

	test('la fenêtre glisse : 15 minutes après le premier échec, une place revient', () => {
		for (let i = 0; i < 10; i++) rateLimit.prendre('a', i)
		expect(rateLimit.prendre('a', 15 * MIN - 1).autorise).toBe(false)
		expect(rateLimit.prendre('a', 15 * MIN + 1).autorise).toBe(true)
	})

	test('un essai refusé ne prolonge pas le frein', () => {
		for (let i = 0; i < 10; i++) rateLimit.prendre('a', 0)
		for (let t = 1000; t < 14 * MIN; t += 60_000) rateLimit.prendre('a', t)
		expect(rateLimit.prendre('a', 15 * MIN + 1).autorise).toBe(true)
	})

	test('une réussite rend sa place : seuls les échecs comptent', () => {
		for (let i = 0; i < 20; i++) {
			expect(rateLimit.prendre('a', i).autorise).toBe(true)
			rateLimit.rendre('a', i)
		}
	})

	test('deux freins de même nom partagent leurs compteurs', () => {
		const other = createRateLimit({ nom: 'essai-frein', limite: 10, fenetreMs: 15 * MIN })
		for (let i = 0; i < 10; i++) rateLimit.prendre('a', 0)
		expect(other.prendre('a', 1).autorise).toBe(false)
	})

	test('table pleine : la plus ancienne clé part, le nouvel arrivant est servi', () => {
		const small = createRateLimit({ nom: 'essai-petit', limite: 1, fenetreMs: MIN, clesMax: 2 })
		small.prendre('x', 0)
		small.prendre('y', 0)
		expect(small.prendre('z', 0).autorise).toBe(true)
		expect(small.prendre('x', 1).autorise).toBe(true)
		small.vider()
	})
})
