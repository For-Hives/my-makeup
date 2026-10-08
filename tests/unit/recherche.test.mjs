import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	cleRecherche,
	lireRecherche,
	paginer,
	PAR_PAGE,
	rechercheValide,
	resultatsRecherche,
	titreResultats,
	urlApiRecherche,
	urlPageRecherche,
} from '../../src/lib/recherche.js'

describe('search of the URL (UI-07)', () => {
	test('fields trimmed, first value of a repeated parameter, page within bounds', () => {
		assert.deepEqual(lireRecherche({ city: '  Annecy  ' }), {
			search: '',
			city: 'Annecy',
			page: 1,
		})
		assert.deepEqual(
			lireRecherche({ search: ['mariage', 'x'], city: 'Lyon', page: '3' }),
			{
				search: 'mariage',
				city: 'Lyon',
				page: 3,
			}
		)
		for (const page of ['0', '-2', 'abc', '99999', undefined])
			assert.equal(lireRecherche({ page }).page, 1)
		assert.equal(lireRecherche({ search: 'x'.repeat(300) }).search.length, 100)
		assert.deepEqual(lireRecherche(), { search: '', city: '', page: 1 })
		assert.deepEqual(lireRecherche(null), { search: '', city: '', page: 1 })
	})

	test('a city alone is a search; nothing at all is not', () => {
		assert.equal(rechercheValide({ search: '', city: 'Annecy' }), true)
		assert.equal(rechercheValide({ search: 'fx', city: '' }), true)
		assert.equal(rechercheValide({ search: '', city: '' }), false)
	})

	test('API URL: the city is also the term when alone, every value encoded', () => {
		assert.equal(
			urlApiRecherche('https://api.example.test/', {
				search: '',
				city: 'Annecy',
			}),
			'https://api.example.test/api/searching?search=Annecy&city=Annecy'
		)
		assert.equal(
			urlApiRecherche('https://api.example.test', {
				search: 'mariée & soirée',
				city: 'Saint-Étienne',
			}),
			'https://api.example.test/api/searching?search=mari%C3%A9e+%26+soir%C3%A9e&city=Saint-%C3%89tienne'
		)
		assert.equal(
			urlApiRecherche('https://api.example.test', { search: 'fx', city: '' }),
			'https://api.example.test/api/searching?search=fx'
		)
		assert.equal(
			urlApiRecherche('https://api.example.test', { search: '', city: '' }),
			null
		)
	})

	test('page URL: empty fields and page 1 left out, shareable', () => {
		assert.equal(urlPageRecherche({ city: 'Annecy' }), '/search?city=Annecy')
		assert.equal(
			urlPageRecherche({ search: ' fx ', city: '', page: 2 }),
			'/search?search=fx&page=2'
		)
		assert.equal(
			urlPageRecherche({ search: 'a&b=c' }),
			'/search?search=a%26b%3Dc'
		)
		assert.equal(urlPageRecherche(), '/search')
		assert.deepEqual(
			lireRecherche(
				Object.fromEntries(
					new URLSearchParams(
						urlPageRecherche({ search: 'a&b=c', city: 'Lyon', page: 2 }).split(
							'?'
						)[1]
					)
				)
			),
			{
				search: 'a&b=c',
				city: 'Lyon',
				page: 2,
			}
		)
	})

	test('same search whatever the page and the case', () => {
		assert.equal(
			cleRecherche({ search: 'Mariage', city: 'ANNECY' }),
			cleRecherche({ search: 'mariage', city: 'annecy' })
		)
		assert.notEqual(
			cleRecherche({ search: 'mariage', city: '' }),
			cleRecherche({ search: '', city: 'mariage' })
		)
	})

	test('pages of 20', () => {
		const liste = Array.from({ length: 45 }, (_, i) => i + 1)
		assert.equal(PAR_PAGE, 20)
		assert.deepEqual(paginer(liste, 1).elements, liste.slice(0, 20))
		const derniere = paginer(liste, 3)
		assert.deepEqual(derniere.elements, [41, 42, 43, 44, 45])
		assert.equal(derniere.premier, 41)
		assert.equal(derniere.pages, 3)
		assert.equal(paginer(liste, 9).page, 3)
		assert.deepEqual(paginer([], 2), {
			elements: [],
			page: 1,
			pages: 1,
			total: 0,
			premier: 1,
		})
		assert.equal(paginer(null, 1).total, 0)
	})

	test('an answer that is not a list is an error; profiles without username are dropped', () => {
		assert.equal(resultatsRecherche({ error: { status: 400 } }), null)
		assert.equal(resultatsRecherche(null), null)
		assert.deepEqual(
			resultatsRecherche([
				{ id: 1, username: 'a' },
				{ id: 2, username: '' },
				null,
				{ id: 3 },
			]),
			[{ id: 1, username: 'a' }]
		)
	})

	test('titles of the results', () => {
		assert.equal(
			titreResultats({ search: 'Annecy', city: 'Annecy' }, 3),
			'3 maquilleuses à Annecy'
		)
		assert.equal(
			titreResultats({ search: 'mariage', city: 'Annecy' }, 1),
			'1 maquilleuse pour « mariage » à Annecy'
		)
		assert.equal(
			titreResultats({ search: 'zzqq', city: '' }, 0),
			'Aucune maquilleuse pour « zzqq »'
		)
	})
})
