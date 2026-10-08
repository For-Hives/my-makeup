import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	attribuerSlugs,
	cheminProfil,
	resoudreProfil,
	SLUG_MAX,
	slugifier,
	tableDesSlugs,
} from '../../src/lib/slug.js'

describe('slugifier (plans/02 U09-U10)', () => {
	test('U09 « Zoé Lefèvre » → zoe-lefevre', () => {
		assert.equal(slugifier('Zoé Lefèvre'), 'zoe-lefevre')
		assert.equal(slugifier('zoé lefèvre'), 'zoe-lefevre')
		assert.equal(slugifier('ZOE LEFEVRE'), 'zoe-lefevre')
	})

	test('U10 apostrophes, emojis and punctuation removed, dashes merged, 70 characters at most', () => {
		assert.equal(slugifier("Léa D'Angelo"), 'lea-d-angelo')
		assert.equal(slugifier('  Make-up ✨ by   Inès !! '), 'make-up-by-ines')
		assert.equal(slugifier('anne--marie__b.c'), 'anne-marie-b-c')
		assert.equal(slugifier('Chloé_74'), 'chloe-74')
		assert.equal(slugifier('Œuvre Ærø Straße'), 'oeuvre-aero-strasse')
		assert.equal(slugifier('ÇA'), 'ca')
		const long = slugifier(`${'abcdefghij '.repeat(10)}`)
		assert.ok(long.length <= SLUG_MAX)
		assert.ok(!long.endsWith('-'))
		assert.match(long, /^[a-z0-9]+(-[a-z0-9]+)*$/)
	})

	test('nothing usable: empty string', () => {
		for (const v of ['', '   ', '✨✨', '---', null, undefined, {}])
			assert.equal(slugifier(v), '')
		assert.equal(slugifier(42), '42')
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
			const slugs = Object.fromEntries(
				attribuerSlugs(ordre).map(p => [p.id, p.slug])
			)
			assert.deepEqual(slugs, attendu)
		}
	})

	test('same date: the smaller id first; a new profile never changes older slugs', () => {
		const avant = [
			{ id: 5, username: 'Ana', createdAt: '2024-01-01T00:00:00.000Z' },
			{ id: 4, username: 'ana', createdAt: '2024-01-01T00:00:00.000Z' },
		]
		const slugs = l =>
			Object.fromEntries(attribuerSlugs(l).map(p => [p.id, p.slug]))
		assert.deepEqual(slugs(avant), { 4: 'ana', 5: 'ana-2' })
		const apres = [
			...avant,
			{ id: 30, username: 'ana-2', createdAt: '2026-10-01T00:00:00.000Z' },
		]
		assert.deepEqual(slugs(apres), { 4: 'ana', 5: 'ana-2', 30: 'ana-2-2' })
	})

	test('a suffix keeps the slug within 70 characters', () => {
		const nom = 'x'.repeat(80)
		const [a, b] = attribuerSlugs([
			{ id: 1, username: nom, createdAt: '2024-01-01' },
			{ id: 2, username: nom, createdAt: '2024-01-02' },
		])
		assert.equal(a.slug, 'x'.repeat(70))
		assert.equal(b.slug, `${'x'.repeat(68)}-2`)
	})

	test('U12 never empty: maquilleuse-<id>', () => {
		const [p] = attribuerSlugs([{ id: 17, username: '✨', createdAt: null }])
		assert.equal(p.slug, 'maquilleuse-17')
		const [q] = attribuerSlugs([{ id: 18, username: null }])
		assert.equal(q.slug, 'maquilleuse-18')
	})

	test('entries without id are ignored, not fatal', () => {
		assert.deepEqual(attribuerSlugs(null), [])
		assert.deepEqual(
			attribuerSlugs([null, { username: 'sans-id' }]).map(p => p.slug),
			[]
		)
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
		assert.equal(r.profil.id, 1)
		assert.equal(r.redirection, false)
		assert.equal(resoudreProfil('zoe-lefevre-2', table).profil.id, 2)
		assert.equal(resoudreProfil('camille-annemasse', table).redirection, false)
	})

	test('U13 old username (spaces, capitals) → 308 target of the table, in one hop', () => {
		assert.deepEqual(
			(({ slug, redirection }) => ({ slug, redirection }))(
				resoudreProfil('Zoé Lefèvre', table)
			),
			{ slug: 'zoe-lefevre', redirection: true }
		)
		// the username of the second one, not the slug of the first one
		assert.equal(resoudreProfil('ZOE LEFEVRE', table).slug, 'zoe-lefevre-2')
		assert.equal(resoudreProfil('LeaNantes', table).slug, 'leanantes')
		assert.equal(resoudreProfil('LeaNantes', table).redirection, true)
		// variant of a slug
		assert.equal(
			resoudreProfil('Camille-Annemasse', table).slug,
			'camille-annemasse'
		)
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
		assert.equal(avecHomonyme.slugParId.get('2'), 'zoe-lefevre-2')
		assert.equal(avecHomonyme.slugParId.get('5'), 'zoe-lefevre-2-2')
		const r = resoudreProfil('zoe-lefevre-2', avecHomonyme)
		assert.equal(r.profil.id, 2)
		assert.equal(r.redirection, false)
		assert.equal(resoudreProfil('zoe-lefevre-2-2', avecHomonyme).profil.id, 5)
	})

	test('unknown → null (404)', () => {
		for (const s of ['inconnue', '', null, undefined, 'zoe-lefevre-9'])
			assert.equal(resoudreProfil(s, table), null)
	})

	test('path of a profile', () => {
		assert.equal(cheminProfil('zoe-lefevre'), '/profil/zoe-lefevre')
		assert.equal(table.slugParId.get('2'), 'zoe-lefevre-2')
	})
})
