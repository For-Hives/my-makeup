import { describe, expect, test } from 'bun:test'
import { assignSlugs, profilePath, resolveProfile, SLUG_MAX, slugify, slugTable, slugWithSuffix } from '@/lib/slug'
import jeu from './fixtures/slugs-ancien-site.json'

// Ported from tests/unit/slug.test.mjs of the old site (branch main): same cases, same expected values.

describe('slugifier (plans/02 U09-U10)', () => {
	test('U09 « Zoé Lefèvre » → zoe-lefevre', () => {
		expect(slugify('Zoé Lefèvre')).toBe('zoe-lefevre')
		expect(slugify('zoé lefèvre')).toBe('zoe-lefevre')
		expect(slugify('ZOE LEFEVRE')).toBe('zoe-lefevre')
	})

	test('U10 apostrophes, emojis and punctuation removed, dashes merged, 70 characters at most', () => {
		expect(slugify("Léa D'Angelo")).toBe('lea-d-angelo')
		expect(slugify('  Make-up ✨ by   Inès !! ')).toBe('make-up-by-ines')
		expect(slugify('anne--marie__b.c')).toBe('anne-marie-b-c')
		expect(slugify('Chloé_74')).toBe('chloe-74')
		expect(slugify('Œuvre Ærø Straße')).toBe('oeuvre-aero-strasse')
		expect(slugify('ÇA')).toBe('ca')
		const long = slugify(`${'abcdefghij '.repeat(10)}`)
		expect(long.length).toBeLessThanOrEqual(SLUG_MAX)
		expect(long.endsWith('-')).toBe(false)
		expect(long).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
	})

	test('nothing usable: empty string', () => {
		for (const v of ['', '   ', '✨✨', '---', null, undefined, {}]) {
			expect(slugify(v)).toBe('')
		}
		expect(slugify(42)).toBe('42')
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
			const slugs = Object.fromEntries(assignSlugs(ordre).map(p => [p.id, p.slug]))
			expect(slugs).toStrictEqual(attendu)
		}
		// Above, the ids grow with the dates: sorting by id would give the same slugs. Here the
		// older profile has the larger id, and still keeps the slug (answer of the old site's slug.js).
		const idsContreDates = [
			{ id: 3, username: 'Zoé Lefèvre', createdAt: '2025-06-01T10:00:00.000Z' },
			{ id: 12, username: 'ZOE LEFEVRE', createdAt: '2023-01-01T10:00:00.000Z' },
		]
		for (const ordre of [idsContreDates, [...idsContreDates].reverse()]) {
			const slugs = Object.fromEntries(assignSlugs(ordre).map(p => [p.id, p.slug]))
			expect(slugs).toStrictEqual({ 12: 'zoe-lefevre', 3: 'zoe-lefevre-2' })
		}
	})

	test('same date: the smaller id first; a new profile never changes older slugs', () => {
		const avant = [
			{ id: 5, username: 'Ana', createdAt: '2024-01-01T00:00:00.000Z' },
			{ id: 4, username: 'ana', createdAt: '2024-01-01T00:00:00.000Z' },
		]
		const slugs = (l: Parameters<typeof assignSlugs>[0]) => Object.fromEntries(assignSlugs(l).map(p => [p.id, p.slug]))
		expect(slugs(avant)).toStrictEqual({ 4: 'ana', 5: 'ana-2' })
		// The ids are compared as numbers: as texts, « 10 » would come before « 9 » (answer of the
		// old site's slug.js).
		const neufEtDix = [
			{ id: 10, username: 'Ana', createdAt: '2024-01-01T00:00:00.000Z' },
			{ id: 9, username: 'ana', createdAt: '2024-01-01T00:00:00.000Z' },
		]
		expect(slugs(neufEtDix)).toStrictEqual({ 9: 'ana', 10: 'ana-2' })
		expect(slugs([...neufEtDix].reverse())).toStrictEqual({ 9: 'ana', 10: 'ana-2' })
		const apres = [...avant, { id: 30, username: 'ana-2', createdAt: '2026-10-01T00:00:00.000Z' }]
		expect(slugs(apres)).toStrictEqual({ 4: 'ana', 5: 'ana-2', 30: 'ana-2-2' })
	})

	test('a suffix keeps the slug within 70 characters', () => {
		const nom = 'x'.repeat(80)
		const [a, b] = assignSlugs([
			{ id: 1, username: nom, createdAt: '2024-01-01' },
			{ id: 2, username: nom, createdAt: '2024-01-02' },
		])
		expect(a?.slug).toBe('x'.repeat(70))
		expect(b?.slug).toBe(`${'x'.repeat(68)}-2`)
	})

	// not on the old site, where the rule is inlined in assignSlugs: the v3 exports it
	test('the candidate of a taken slug: the base is cut, then -n', () => {
		expect(slugWithSuffix('ana', 2)).toBe('ana-2')
		expect(slugWithSuffix('x'.repeat(70), 10)).toBe(`${'x'.repeat(67)}-10`)
		// the cut falls on a dash: no « --2 »
		expect(slugWithSuffix(`${'x'.repeat(67)}-yz`, 2)).toBe(`${'x'.repeat(67)}-2`)
	})

	test('U12 never empty: maquilleuse-<id>', () => {
		const [p] = assignSlugs([{ id: 17, username: '✨', createdAt: null }])
		expect(p?.slug).toBe('maquilleuse-17')
		const [q] = assignSlugs([{ id: 18, username: null }])
		expect(q?.slug).toBe('maquilleuse-18')
	})

	test('entries without id are ignored, not fatal', () => {
		expect(assignSlugs(null)).toStrictEqual([])
		expect(assignSlugs([null, { username: 'sans-id' }]).map(p => p.slug)).toStrictEqual([])
	})
})

describe('resoudreProfil (plans/02 U13, U61)', () => {
	const table = slugTable([
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
		const r = resolveProfile('zoe-lefevre', table)
		expect(r?.profil.id).toBe(1)
		expect(r?.redirection).toBe(false)
		expect(resolveProfile('zoe-lefevre-2', table)?.profil.id).toBe(2)
		expect(resolveProfile('camille-annemasse', table)?.redirection).toBe(false)
	})

	test('U13 old username (spaces, capitals) → 308 target of the table, in one hop', () => {
		const r = resolveProfile('Zoé Lefèvre', table)
		expect({ slug: r?.slug, redirection: r?.redirection }).toStrictEqual({
			slug: 'zoe-lefevre',
			redirection: true,
		})
		// the username of the second one, not the slug of the first one
		expect(resolveProfile('ZOE LEFEVRE', table)?.slug).toBe('zoe-lefevre-2')
		expect(resolveProfile('LeaNantes', table)?.slug).toBe('leanantes')
		expect(resolveProfile('LeaNantes', table)?.redirection).toBe(true)
		// variant of a slug
		expect(resolveProfile('Camille-Annemasse', table)?.slug).toBe('camille-annemasse')
	})

	test('known limit: a username equal to the slug of another profile serves that profile (the slug wins)', () => {
		const avecHomonyme = slugTable([
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
		const r = resolveProfile('zoe-lefevre-2', avecHomonyme)
		expect(r?.profil.id).toBe(2)
		expect(r?.redirection).toBe(false)
		expect(resolveProfile('zoe-lefevre-2-2', avecHomonyme)?.profil.id).toBe(5)
	})

	test('unknown → null (404)', () => {
		for (const s of ['inconnue', '', null, undefined, 'zoe-lefevre-9']) {
			expect(resolveProfile(s, table)).toBeNull()
		}
	})

	test('path of a profile', () => {
		expect(profilePath('zoe-lefevre')).toBe('/profil/zoe-lefevre')
		expect(table.slugParId.get('2')).toBe('zoe-lefevre-2')
	})
})

// The expected values of the fixture were computed by the old site's src/lib/slug.js (see its
// « source » field), never by this port. The old site neither holds nor runs this set: it is a
// frozen snapshot of its answers.
//
// To compute it again while the old code exists, outside of this repository:
// 1. extract the old code: `git show origin/main:src/lib/slug.js > slug.mjs`, in a temporary folder;
// 2. under Node, on the `profils` of the fixture (id, username, createdAt), run assignSlugs:
//    `slugAttendu` is the slug of each profile, `ordreDeCreation` the ids in the order returned;
// 3. on each of its `segments`, run resolveProfile(segment, slugTable(profils)): `id`, `slug`
//    and `redirection` of the answer, or `id` and `slug` null when it answers null;
// 4. replace the expected values, and write in `source` the commit of main and the last commit
//    that changed slug.js.
// Never with src/lib/slug.ts: the port would be compared to itself.
describe('same slugs as the old site on a fictitious set (plans/01 §6.2)', () => {
	const profils = jeu.profils.map(({ id, username, createdAt }) => ({ id, username, createdAt }))

	test('each profile gets the slug the old site gives it, whatever the order of the list', () => {
		const attendu = Object.fromEntries(jeu.profils.map(p => [p.id, p.slugAttendu]))
		for (const ordre of [profils, [...profils].reverse()]) {
			const slugs = Object.fromEntries(assignSlugs(ordre).map(p => [p.id, p.slug]))
			expect(slugs).toStrictEqual(attendu)
		}
	})

	test('the profiles come back in the same creation order', () => {
		expect(assignSlugs(profils).map(p => p.id)).toStrictEqual(jeu.ordreDeCreation)
	})

	test('a slug or an old username is served or redirected as on the old site', () => {
		const table = slugTable(profils)
		for (const { segment, id, slug, redirection } of jeu.segments) {
			const r = resolveProfile(segment, table)
			const obtenu = r ? { id: r.profil.id, slug: r.slug, redirection: r.redirection } : null
			expect(obtenu, segment).toStrictEqual(slug === null ? null : { id, slug, redirection })
		}
	})

	test('the set is large enough to mean something', () => {
		expect(jeu.profils.length).toBeGreaterThanOrEqual(50)
		expect(new Set(jeu.profils.map(p => p.slugAttendu)).size).toBe(jeu.profils.length)
		expect(jeu.profils.every(p => p.slugAttendu.length > 0 && p.slugAttendu.length <= SLUG_MAX)).toBe(true)
		expect(jeu.profils.filter(p => /-\d+$/.test(p.slugAttendu)).length).toBeGreaterThanOrEqual(10)
		expect(jeu.segments.filter(s => s.redirection === true).length).toBeGreaterThanOrEqual(10)
		expect(jeu.segments.filter(s => s.redirection === false).length).toBeGreaterThanOrEqual(5)
		expect(jeu.segments.filter(s => s.slug === null).length).toBeGreaterThanOrEqual(3)
	})
})
