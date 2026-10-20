import { describe, expect, test } from 'bun:test'
import { SEGMENT_MAX, type UrlCandidate, urlTarget, valuesToSearch } from '@/lib/profile/url'
import { slugify } from '@/lib/slug'

/**
 * What the address of a profile leads to (ticket 104; plan 02 U13 and U61 on the rule the page applies):
 * the slug wins, the old username and the variants of a slug go to the slug in one hop, a hidden profile
 * and an unknown address lead nowhere. The runs against the bench: tests/e2e/public-profile.spec.ts.
 */

const profile = (id: number, slug: string, reste: Partial<UrlCandidate> = {}): UrlCandidate => ({
	id,
	slug,
	status: 'published',
	createdAt: `2024-0${id}-01T00:00:00.000Z`,
	...reste,
})

/** The candidates a read gives for a segment: the profiles whose slug or old username it names. */
const candidatesFor = (segment: string, profils: readonly UrlCandidate[]): UrlCandidate[] =>
	profils.filter(
		({ slug, legacyUsername }) => slug === segment || slug === slugify(segment) || legacyUsername === segment
	)

const dataset = [
	profile(1, 'zoe-lefevre', { legacyUsername: 'Zoé Lefèvre' }),
	profile(2, 'zoe-lefevre-2', { legacyUsername: 'ZOE LEFEVRE' }),
	profile(3, 'lea-nantes', { legacyUsername: 'LeaNantes', status: 'hidden' }),
	profile(4, 'camille', { status: 'draft', publishable: false }),
]

const target = (segment: string, profils = dataset) => urlTarget(segment, candidatesFor(segment, profils))

describe('U13, U61 : l’adresse d’un profil', () => {
	test('le slug donne le profil, publié ou en brouillon', () => {
		expect(target('zoe-lefevre')).toMatchObject({ type: 'profil', profil: { id: 1 } })
		expect(target('camille')).toMatchObject({ type: 'profil', profil: { id: 4 } })
	})

	test('U13 : l’ancien nom d’utilisateur (espaces, majuscules, accents) va au slug, en un saut', () => {
		expect(target('Zoé Lefèvre')).toEqual({ type: 'redirection', slug: 'zoe-lefevre' })
		expect(target('ZOE LEFEVRE')).toEqual({ type: 'redirection', slug: 'zoe-lefevre-2' })
	})

	test('U61 : une variante du slug (majuscules) va au slug', () => {
		expect(target('Zoe-Lefevre')).toEqual({ type: 'redirection', slug: 'zoe-lefevre' })
		expect(target('Camille')).toEqual({ type: 'redirection', slug: 'camille' })
	})

	test('le slug l’emporte sur l’ancien nom d’un autre profil', () => {
		const other = [profile(1, 'zoe-lefevre'), profile(2, 'zoe-lefevre-2', { legacyUsername: 'zoe-lefevre' })]
		expect(target('zoe-lefevre', other)).toMatchObject({ type: 'profil', profil: { id: 1 } })
	})

	test('deux profils qui portent le même ancien nom : le plus ancien', () => {
		const homonyms = [
			profile(5, 'cinq', { legacyUsername: 'Nom', createdAt: '2024-05-01T00:00:00.000Z' }),
			profile(6, 'six', { legacyUsername: 'Nom', createdAt: '2023-01-01T00:00:00.000Z' }),
		]
		expect(target('Nom', homonyms)).toEqual({ type: 'redirection', slug: 'six' })
	})

	test('un profil masqué ne mène nulle part, ni par son slug ni par son ancien nom', () => {
		expect(target('lea-nantes')).toEqual({ type: 'inconnue' })
		expect(target('LeaNantes')).toEqual({ type: 'inconnue' })
		expect(target('Lea-Nantes')).toEqual({ type: 'inconnue' })
	})

	test('une adresse inconnue, vide, trop longue ou à caractère de contrôle ne mène nulle part', () => {
		expect(target('audit-inexistant-zz9')).toEqual({ type: 'inconnue' })
		expect(urlTarget('', dataset)).toEqual({ type: 'inconnue' })
		expect(urlTarget('🙂', dataset)).toEqual({ type: 'inconnue' })
		expect(urlTarget('a\u0000b', dataset)).toEqual({ type: 'inconnue' })
		expect(urlTarget('a'.repeat(SEGMENT_MAX + 1), dataset)).toEqual({ type: 'inconnue' })
		expect(urlTarget(undefined, dataset)).toEqual({ type: 'inconnue' })
		expect(valuesToSearch('Zoé Lefèvre')).toEqual({ segment: 'Zoé Lefèvre', slugifie: 'zoe-lefevre' })
		expect(valuesToSearch('a\u0000b')).toBeNull()
	})
})
