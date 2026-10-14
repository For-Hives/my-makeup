import { describe, expect, test } from 'bun:test'
import { type CandidatDeLAdresse, cibleDeLAdresse, SEGMENT_MAX, valeursARechercher } from '@/lib/profil/adresse'
import { slugifier } from '@/lib/slug'

/**
 * What the address of a profile leads to (ticket 104; plan 02 U13 and U61 on the rule the page applies):
 * the slug wins, the old username and the variants of a slug go to the slug in one hop, a hidden profile
 * and an unknown address lead nowhere. The runs against the bench: tests/e2e/profil-public.spec.ts.
 */

const profil = (id: number, slug: string, reste: Partial<CandidatDeLAdresse> = {}): CandidatDeLAdresse => ({
	id,
	slug,
	statut: 'publie',
	createdAt: `2024-0${id}-01T00:00:00.000Z`,
	...reste,
})

/** The candidates a read gives for a segment: the profiles whose slug or old username it names. */
const candidatsPour = (segment: string, profils: readonly CandidatDeLAdresse[]): CandidatDeLAdresse[] =>
	profils.filter(
		({ slug, legacyUsername }) => slug === segment || slug === slugifier(segment) || legacyUsername === segment
	)

const jeu = [
	profil(1, 'zoe-lefevre', { legacyUsername: 'Zoé Lefèvre' }),
	profil(2, 'zoe-lefevre-2', { legacyUsername: 'ZOE LEFEVRE' }),
	profil(3, 'lea-nantes', { legacyUsername: 'LeaNantes', statut: 'masque' }),
	profil(4, 'camille', { statut: 'brouillon', publiable: false }),
]

const cible = (segment: string, profils = jeu) => cibleDeLAdresse(segment, candidatsPour(segment, profils))

describe('U13, U61 : l’adresse d’un profil', () => {
	test('le slug donne le profil, publié ou en brouillon', () => {
		expect(cible('zoe-lefevre')).toMatchObject({ type: 'profil', profil: { id: 1 } })
		expect(cible('camille')).toMatchObject({ type: 'profil', profil: { id: 4 } })
	})

	test('U13 : l’ancien nom d’utilisateur (espaces, majuscules, accents) va au slug, en un saut', () => {
		expect(cible('Zoé Lefèvre')).toEqual({ type: 'redirection', slug: 'zoe-lefevre' })
		expect(cible('ZOE LEFEVRE')).toEqual({ type: 'redirection', slug: 'zoe-lefevre-2' })
	})

	test('U61 : une variante du slug (majuscules) va au slug', () => {
		expect(cible('Zoe-Lefevre')).toEqual({ type: 'redirection', slug: 'zoe-lefevre' })
		expect(cible('Camille')).toEqual({ type: 'redirection', slug: 'camille' })
	})

	test('le slug l’emporte sur l’ancien nom d’un autre profil', () => {
		const autres = [profil(1, 'zoe-lefevre'), profil(2, 'zoe-lefevre-2', { legacyUsername: 'zoe-lefevre' })]
		expect(cible('zoe-lefevre', autres)).toMatchObject({ type: 'profil', profil: { id: 1 } })
	})

	test('deux profils qui portent le même ancien nom : le plus ancien', () => {
		const homonymes = [
			profil(5, 'cinq', { legacyUsername: 'Nom', createdAt: '2024-05-01T00:00:00.000Z' }),
			profil(6, 'six', { legacyUsername: 'Nom', createdAt: '2023-01-01T00:00:00.000Z' }),
		]
		expect(cible('Nom', homonymes)).toEqual({ type: 'redirection', slug: 'six' })
	})

	test('un profil masqué ne mène nulle part, ni par son slug ni par son ancien nom', () => {
		expect(cible('lea-nantes')).toEqual({ type: 'inconnue' })
		expect(cible('LeaNantes')).toEqual({ type: 'inconnue' })
		expect(cible('Lea-Nantes')).toEqual({ type: 'inconnue' })
	})

	test('une adresse inconnue, vide, trop longue ou à caractère de contrôle ne mène nulle part', () => {
		expect(cible('audit-inexistant-zz9')).toEqual({ type: 'inconnue' })
		expect(cibleDeLAdresse('', jeu)).toEqual({ type: 'inconnue' })
		expect(cibleDeLAdresse('🙂', jeu)).toEqual({ type: 'inconnue' })
		expect(cibleDeLAdresse('a\u0000b', jeu)).toEqual({ type: 'inconnue' })
		expect(cibleDeLAdresse('a'.repeat(SEGMENT_MAX + 1), jeu)).toEqual({ type: 'inconnue' })
		expect(cibleDeLAdresse(undefined, jeu)).toEqual({ type: 'inconnue' })
		expect(valeursARechercher('Zoé Lefèvre')).toEqual({ segment: 'Zoé Lefèvre', slugifie: 'zoe-lefevre' })
		expect(valeursARechercher('a\u0000b')).toBeNull()
	})
})
