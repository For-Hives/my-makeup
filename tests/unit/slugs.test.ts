import { describe, expect, test } from 'bun:test'
import {
	attribuerSlugs,
	cheminProfil,
	resoudreProfil,
	SLUG_MAX,
	slugAvecSuffixe,
	slugifier,
	tableDesSlugs,
} from '@/lib/slug'

// Ported from tests/unit/slug.test.mjs of the old site (branch main): same cases, same expected values.

describe('slugifier (plans/02 U09-U10)', () => {
	test('U09 « Zoé Lefèvre » → zoe-lefevre', () => {
		expect(slugifier('Zoé Lefèvre')).toBe('zoe-lefevre')
		expect(slugifier('zoé lefèvre')).toBe('zoe-lefevre')
		expect(slugifier('ZOE LEFEVRE')).toBe('zoe-lefevre')
	})

	test('U10 apostrophes, emojis and punctuation removed, dashes merged, 70 characters at most', () => {
		expect(slugifier("Léa D'Angelo")).toBe('lea-d-angelo')
		expect(slugifier('  Make-up ✨ by   Inès !! ')).toBe('make-up-by-ines')
		expect(slugifier('anne--marie__b.c')).toBe('anne-marie-b-c')
		expect(slugifier('Chloé_74')).toBe('chloe-74')
		expect(slugifier('Œuvre Ærø Straße')).toBe('oeuvre-aero-strasse')
		expect(slugifier('ÇA')).toBe('ca')
		const long = slugifier(`${'abcdefghij '.repeat(10)}`)
		expect(long.length).toBeLessThanOrEqual(SLUG_MAX)
		expect(long.endsWith('-')).toBe(false)
		expect(long).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
	})

	test('nothing usable: empty string', () => {
		for (const v of ['', '   ', '✨✨', '---', null, undefined, {}]) {
			expect(slugifier(v)).toBe('')
		}
		expect(slugifier(42)).toBe('42')
	})
})

describe('attribuerSlugs (plans/02 U11-U12)', () => {
	test('U11 collisions: -2, -3 by creation date, whatever the order of the list', () => {
		const profils = [
			{ id: 9, username: 'ZOE LEFEVRE', createdAt: '2024-03-01T10:00:00.000Z' },
			{ id: 3, username: 'Zoé Lefèvre', createdAt: '2023-01-01T10:00:00.000Z' },
			{
				id: 12,
				username: 'zoé  lefèvre',
				createdAt: '2025-06-01T10:00:00.000Z',
			},
		]
		const attendu = {
			3: 'zoe-lefevre',
			9: 'zoe-lefevre-2',
			12: 'zoe-lefevre-3',
		}
		for (const ordre of [profils, [...profils].reverse()]) {
			const slugs = Object.fromEntries(attribuerSlugs(ordre).map(p => [p.id, p.slug]))
			expect(slugs).toStrictEqual(attendu)
		}
	})

	test('same date: the smaller id first; a new profile never changes older slugs', () => {
		const avant = [
			{ id: 5, username: 'Ana', createdAt: '2024-01-01T00:00:00.000Z' },
			{ id: 4, username: 'ana', createdAt: '2024-01-01T00:00:00.000Z' },
		]
		const slugs = (l: Parameters<typeof attribuerSlugs>[0]) =>
			Object.fromEntries(attribuerSlugs(l).map(p => [p.id, p.slug]))
		expect(slugs(avant)).toStrictEqual({ 4: 'ana', 5: 'ana-2' })
		const apres = [...avant, { id: 30, username: 'ana-2', createdAt: '2026-10-01T00:00:00.000Z' }]
		expect(slugs(apres)).toStrictEqual({ 4: 'ana', 5: 'ana-2', 30: 'ana-2-2' })
	})

	test('a suffix keeps the slug within 70 characters', () => {
		const nom = 'x'.repeat(80)
		const [a, b] = attribuerSlugs([
			{ id: 1, username: nom, createdAt: '2024-01-01' },
			{ id: 2, username: nom, createdAt: '2024-01-02' },
		])
		expect(a?.slug).toBe('x'.repeat(70))
		expect(b?.slug).toBe(`${'x'.repeat(68)}-2`)
	})

	// not on the old site, where the rule is inlined in attribuerSlugs: the v3 exports it
	test('the candidate of a taken slug: the base is cut, then -n', () => {
		expect(slugAvecSuffixe('ana', 2)).toBe('ana-2')
		expect(slugAvecSuffixe('x'.repeat(70), 10)).toBe(`${'x'.repeat(67)}-10`)
		// the cut falls on a dash: no « --2 »
		expect(slugAvecSuffixe(`${'x'.repeat(67)}-yz`, 2)).toBe(`${'x'.repeat(67)}-2`)
	})

	test('U12 never empty: maquilleuse-<id>', () => {
		const [p] = attribuerSlugs([{ id: 17, username: '✨', createdAt: null }])
		expect(p?.slug).toBe('maquilleuse-17')
		const [q] = attribuerSlugs([{ id: 18, username: null }])
		expect(q?.slug).toBe('maquilleuse-18')
	})

	test('entries without id are ignored, not fatal', () => {
		expect(attribuerSlugs(null)).toStrictEqual([])
		expect(attribuerSlugs([null, { username: 'sans-id' }]).map(p => p.slug)).toStrictEqual([])
	})
})

describe('resoudreProfil (plans/02 U13, U61)', () => {
	const table = tableDesSlugs([
		{ id: 1, username: 'Zoé Lefèvre', createdAt: '2023-01-01T00:00:00.000Z' },
		{ id: 2, username: 'ZOE LEFEVRE', createdAt: '2024-01-01T00:00:00.000Z' },
		{
			id: 3,
			username: 'camille-annemasse',
			createdAt: '2024-02-01T00:00:00.000Z',
		},
		{ id: 4, username: 'LeaNantes', createdAt: '2024-03-01T00:00:00.000Z' },
	])

	test('the slug serves the profile', () => {
		const r = resoudreProfil('zoe-lefevre', table)
		expect(r?.profil.id).toBe(1)
		expect(r?.redirection).toBe(false)
		expect(resoudreProfil('zoe-lefevre-2', table)?.profil.id).toBe(2)
		expect(resoudreProfil('camille-annemasse', table)?.redirection).toBe(false)
	})

	test('U13 old username (spaces, capitals) → 308 target of the table, in one hop', () => {
		const r = resoudreProfil('Zoé Lefèvre', table)
		expect({ slug: r?.slug, redirection: r?.redirection }).toStrictEqual({
			slug: 'zoe-lefevre',
			redirection: true,
		})
		// the username of the second one, not the slug of the first one
		expect(resoudreProfil('ZOE LEFEVRE', table)?.slug).toBe('zoe-lefevre-2')
		expect(resoudreProfil('LeaNantes', table)?.slug).toBe('leanantes')
		expect(resoudreProfil('LeaNantes', table)?.redirection).toBe(true)
		// variant of a slug
		expect(resoudreProfil('Camille-Annemasse', table)?.slug).toBe('camille-annemasse')
	})

	test('known limit: a username equal to the slug of another profile serves that profile (the slug wins)', () => {
		const avecHomonyme = tableDesSlugs([
			{ id: 1, username: 'Zoé Lefèvre', createdAt: '2023-01-01T00:00:00.000Z' },
			{ id: 2, username: 'ZOE LEFEVRE', createdAt: '2024-01-01T00:00:00.000Z' },
			{
				id: 5,
				username: 'zoe-lefevre-2',
				createdAt: '2025-01-01T00:00:00.000Z',
			},
		])
		// the older slug keeps its profile, the newer one gets its own slug
		expect(avecHomonyme.slugParId.get('2')).toBe('zoe-lefevre-2')
		expect(avecHomonyme.slugParId.get('5')).toBe('zoe-lefevre-2-2')
		const r = resoudreProfil('zoe-lefevre-2', avecHomonyme)
		expect(r?.profil.id).toBe(2)
		expect(r?.redirection).toBe(false)
		expect(resoudreProfil('zoe-lefevre-2-2', avecHomonyme)?.profil.id).toBe(5)
	})

	test('unknown → null (404)', () => {
		for (const s of ['inconnue', '', null, undefined, 'zoe-lefevre-9']) {
			expect(resoudreProfil(s, table)).toBeNull()
		}
	})

	test('path of a profile', () => {
		expect(cheminProfil('zoe-lefevre')).toBe('/profil/zoe-lefevre')
		expect(table.slugParId.get('2')).toBe('zoe-lefevre-2')
	})
})
