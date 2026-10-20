import { describe, expect, test } from 'bun:test'
import { assignSlugs, firstFreeSlug, slugWithSuffix } from '@/lib/slug'

/** A store of slugs that answers which candidates are taken, and counts the questions. */
function magasin(pris: Iterable<string>) {
	const ensemble = new Set(pris)
	const demandes: string[][] = []
	const lesquelsSontPris = (candidats: string[]) => {
		demandes.push(candidats)
		return Promise.resolve(new Set(candidats.filter(candidat => ensemble.has(candidat))))
	}
	return { demandes, lesquelsSontPris }
}

describe('premierSlugLibre : le slug d’un nouveau profil, contre les slugs déjà donnés', () => {
	test('la base quand elle est libre, en une seule question', async () => {
		const { demandes, lesquelsSontPris } = magasin(['ana'])

		expect(await firstFreeSlug('zoe-lefevre', lesquelsSontPris)).toBe('zoe-lefevre')
		expect(demandes.length).toBe(1)
	})

	test('-2, puis -3 : le premier suffixe libre', async () => {
		expect(await firstFreeSlug('zoe-lefevre', magasin(['zoe-lefevre']).lesquelsSontPris)).toBe('zoe-lefevre-2')
		expect(await firstFreeSlug('zoe-lefevre', magasin(['zoe-lefevre', 'zoe-lefevre-2']).lesquelsSontPris)).toBe(
			'zoe-lefevre-3'
		)
	})

	test('un trou laissé par un profil supprimé est repris', async () => {
		expect(await firstFreeSlug('ana', magasin(['ana', 'ana-3']).lesquelsSontPris)).toBe('ana-2')
		expect(await firstFreeSlug('ana', magasin(['ana-2']).lesquelsSontPris)).toBe('ana')
	})

	test('au-delà de 20 candidats pris, il continue', async () => {
		const pris = ['lea', ...Array.from({ length: 30 }, (_, i) => `lea-${i + 2}`)]
		const { demandes, lesquelsSontPris } = magasin(pris)

		expect(await firstFreeSlug('lea', lesquelsSontPris)).toBe('lea-32')
		expect(demandes.length).toBe(2)
	})

	test('le slug et son suffixe tiennent en 70 caractères', async () => {
		const base = 'x'.repeat(70)
		expect(await firstFreeSlug(base, magasin([base]).lesquelsSontPris)).toBe(slugWithSuffix(base, 2))
		expect(slugWithSuffix(base, 2).length).toBe(70)
	})

	test('même réponse que la règle de l’ancien site pour le plus récent des profils', async () => {
		const anciens = [
			{ id: 3, username: 'Zoé Lefèvre', createdAt: '2023-01-01T00:00:00.000Z' },
			{ id: 9, username: 'ZOE LEFEVRE', createdAt: '2024-01-01T00:00:00.000Z' },
		]
		const nouveau = { id: 40, username: 'zoé lefèvre', createdAt: '2026-10-14T00:00:00.000Z' }
		const attendu = assignSlugs([...anciens, nouveau]).find(({ id }) => id === 40)?.slug
		const deja = assignSlugs(anciens).map(({ slug }) => slug)

		expect(await firstFreeSlug('zoe-lefevre', magasin(deja).lesquelsSontPris)).toBe(attendu ?? '')
		expect(attendu).toBe('zoe-lefevre-3')
	})
})
