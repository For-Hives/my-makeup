import { beforeEach, describe, expect, test } from 'bun:test'
import { creerFrein } from '@/lib/auth/rate-limit'

const MIN = 60_000
const frein = creerFrein({ nom: 'essai-frein', limite: 10, fenetreMs: 15 * MIN })
beforeEach(() => frein.vider())

describe('le frein par adresse', () => {
	test('dix places passent, la onzième est refusée avec le temps d’attente', () => {
		for (let i = 0; i < 10; i++) expect(frein.prendre('a', i * 1000).autorise).toBe(true)
		const onzieme = frein.prendre('a', 10_000)
		expect(onzieme).toEqual({ autorise: false, reessayerDansS: 15 * 60 - 10 + 0 })
	})

	test('une autre adresse est libre', () => {
		for (let i = 0; i < 10; i++) frein.prendre('a', 0)
		expect(frein.prendre('a', 1).autorise).toBe(false)
		expect(frein.prendre('b', 1).autorise).toBe(true)
	})

	test('la fenêtre glisse : 15 minutes après le premier échec, une place revient', () => {
		for (let i = 0; i < 10; i++) frein.prendre('a', i)
		expect(frein.prendre('a', 15 * MIN - 1).autorise).toBe(false)
		expect(frein.prendre('a', 15 * MIN + 1).autorise).toBe(true)
	})

	test('un essai refusé ne prolonge pas le frein', () => {
		for (let i = 0; i < 10; i++) frein.prendre('a', 0)
		for (let t = 1000; t < 14 * MIN; t += 60_000) frein.prendre('a', t)
		expect(frein.prendre('a', 15 * MIN + 1).autorise).toBe(true)
	})

	test('une réussite rend sa place : seuls les échecs comptent', () => {
		for (let i = 0; i < 20; i++) {
			expect(frein.prendre('a', i).autorise).toBe(true)
			frein.rendre('a', i)
		}
	})

	test('deux freins de même nom partagent leurs compteurs', () => {
		const autre = creerFrein({ nom: 'essai-frein', limite: 10, fenetreMs: 15 * MIN })
		for (let i = 0; i < 10; i++) frein.prendre('a', 0)
		expect(autre.prendre('a', 1).autorise).toBe(false)
	})

	test('table pleine : la plus ancienne clé part, le nouvel arrivant est servi', () => {
		const petit = creerFrein({ nom: 'essai-petit', limite: 1, fenetreMs: MIN, clesMax: 2 })
		petit.prendre('x', 0)
		petit.prendre('y', 0)
		expect(petit.prendre('z', 0).autorise).toBe(true)
		expect(petit.prendre('x', 1).autorise).toBe(true)
		petit.vider()
	})
})
