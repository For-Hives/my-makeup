import { describe, expect, test } from 'bun:test'
import { assignSlugs, firstFreeSlug, slugWithSuffix } from '@/lib/slug'

/** A store of slugs that answers which candidates are taken, and counts the questions. */
function store(pris: Iterable<string>) {
	const together = new Set(pris)
	const requests: string[][] = []
	const areTaken = (candidats: string[]) => {
		requests.push(candidats)
		return Promise.resolve(new Set(candidats.filter(candidat => together.has(candidat))))
	}
	return { demandes: requests, lesquelsSontPris: areTaken }
}

describe('premierSlugLibre : le slug d’un nouveau profil, contre les slugs déjà donnés', () => {
	test('la base quand elle est libre, en une seule question', async () => {
		const { demandes: requests, lesquelsSontPris: areTaken } = store(['ana'])

		expect(await firstFreeSlug('zoe-lefevre', areTaken)).toBe('zoe-lefevre')
		expect(requests.length).toBe(1)
	})

	test('-2, puis -3 : le premier suffixe libre', async () => {
		expect(await firstFreeSlug('zoe-lefevre', store(['zoe-lefevre']).lesquelsSontPris)).toBe('zoe-lefevre-2')
		expect(await firstFreeSlug('zoe-lefevre', store(['zoe-lefevre', 'zoe-lefevre-2']).lesquelsSontPris)).toBe(
			'zoe-lefevre-3'
		)
	})

	test('un trou laissé par un profil supprimé est repris', async () => {
		expect(await firstFreeSlug('ana', store(['ana', 'ana-3']).lesquelsSontPris)).toBe('ana-2')
		expect(await firstFreeSlug('ana', store(['ana-2']).lesquelsSontPris)).toBe('ana')
	})

	test('au-delà de 20 candidats pris, il continue', async () => {
		const taken = ['lea', ...Array.from({ length: 30 }, (_, i) => `lea-${i + 2}`)]
		const { demandes: requests, lesquelsSontPris: areTaken } = store(taken)

		expect(await firstFreeSlug('lea', areTaken)).toBe('lea-32')
		expect(requests.length).toBe(2)
	})

	test('le slug et son suffixe tiennent en 70 caractères', async () => {
		const base = 'x'.repeat(70)
		expect(await firstFreeSlug(base, store([base]).lesquelsSontPris)).toBe(slugWithSuffix(base, 2))
		expect(slugWithSuffix(base, 2).length).toBe(70)
	})

	test('même réponse que la règle de l’ancien site pour le plus récent des profils', async () => {
		const old = [
			{ id: 3, username: 'Zoé Lefèvre', createdAt: '2023-01-01T00:00:00.000Z' },
			{ id: 9, username: 'ZOE LEFEVRE', createdAt: '2024-01-01T00:00:00.000Z' },
		]
		const fresh = { id: 40, username: 'zoé lefèvre', createdAt: '2026-10-14T00:00:00.000Z' }
		const expected = assignSlugs([...old, fresh]).find(({ id }) => id === 40)?.slug
		const already = assignSlugs(old).map(({ slug }) => slug)

		expect(await firstFreeSlug('zoe-lefevre', store(already).lesquelsSontPris)).toBe(expected ?? '')
		expect(expected).toBe('zoe-lefevre-3')
	})
})
