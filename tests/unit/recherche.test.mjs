import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	annuaireComplet,
	cleRecherche,
	lireRecherche,
	MAX_RESULTATS_API,
	paginer,
	PAR_PAGE,
	rechercheParVille,
	rechercheValide,
	resultatsRecherche,
	sectionsDeLaPage,
	titreResultats,
	urlApiAnnuaire,
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

	test('a search by city alone reads the directory instead of the search, a term never', () => {
		assert.equal(rechercheParVille({ search: '', city: 'Annecy' }), true)
		assert.equal(rechercheParVille({ search: '', city: '74000' }), true)
		// the city sent as the term by an older link
		assert.equal(rechercheParVille({ search: 'annecy', city: 'Annecy' }), true)
		assert.equal(
			rechercheParVille({ search: 'mariage', city: 'Annecy' }),
			false
		)
		assert.equal(rechercheParVille({ search: 'mariage', city: '' }), false)
		assert.equal(rechercheParVille({ search: '', city: '' }), false)
		// no place to rank by: the search, one list (separerParLieu)
		assert.equal(rechercheParVille({ search: '', city: 'France' }), false)
		assert.equal(rechercheParVille({ search: '', city: '-' }), false)
		// the API cuts every answer at 200 cards: a full directory may leave
		// profiles of the city out
		assert.equal(MAX_RESULTATS_API, 200)
		assert.equal(annuaireComplet(new Array(199).fill({})), true)
		assert.equal(annuaireComplet([]), true)
		assert.equal(annuaireComplet(new Array(200).fill({})), false)
		// every searchable profile: the public search without any term
		assert.equal(
			urlApiAnnuaire('https://api.example.test/'),
			'https://api.example.test/api/searching'
		)
		assert.equal(urlApiAnnuaire(undefined), '/api/searching')
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

	test('titles of the results: what was typed, quoted (UI-10)', () => {
		assert.equal(
			titreResultats({ search: 'Annecy', city: 'Annecy' }, 3),
			'3 résultats pour « Annecy »'
		)
		assert.equal(
			titreResultats({ search: '', city: 'Annecy' }, 1),
			'1 résultat pour « Annecy »'
		)
		assert.equal(
			titreResultats({ search: 'mariage', city: 'Annecy' }, 1),
			'1 résultat pour « mariage » à « Annecy »'
		)
		assert.equal(
			titreResultats({ search: 'zzqq', city: '' }, 0),
			'Aucun résultat pour « zzqq »'
		)
		assert.equal(
			titreResultats({ search: 'mariage', city: 'Annecy' }, 0),
			'Aucun résultat pour « mariage » à « Annecy »'
		)
		// never « N maquilleuses à <ville> »: the list is not limited to it
		for (const total of [0, 1, 19])
			assert.doesNotMatch(
				titreResultats({ search: '', city: 'Annecy' }, total),
				/maquilleuses? à/
			)
	})

	test('sections of a page: the profiles of the place, then the others', () => {
		const liste = Array.from({ length: 45 }, (_, i) => i + 1)
		// 28 profiles of the place: page 1 all local, page 2 both, page 3 others
		assert.deepEqual(sectionsDeLaPage(paginer(liste, 1), [28, 17]), [
			liste.slice(0, 20),
			[],
		])
		assert.deepEqual(sectionsDeLaPage(paginer(liste, 2), [28, 17]), [
			liste.slice(20, 28),
			liste.slice(28, 40),
		])
		assert.deepEqual(sectionsDeLaPage(paginer(liste, 3), [28, 17]), [
			[],
			liste.slice(40),
		])
		assert.deepEqual(sectionsDeLaPage(paginer(liste, 1), [0, 45])[0], [])
		assert.deepEqual(sectionsDeLaPage(paginer(liste, 3), [45, 0])[1], [])
		assert.deepEqual(sectionsDeLaPage(paginer([], 1), [0, 0]), [[], []])
	})

	test('sections of a page: four sections, one cut by two pages, an empty one', () => {
		const liste = Array.from({ length: 45 }, (_, i) => i + 1)
		// 3 of the place, 10 of the département, none that travel, 32 others
		const longueurs = [3, 10, 0, 32]
		const page1 = sectionsDeLaPage(paginer(liste, 1), longueurs)
		assert.deepEqual(page1, [
			liste.slice(0, 3),
			liste.slice(3, 13),
			[],
			liste.slice(13, 20),
		])
		const page2 = sectionsDeLaPage(paginer(liste, 2), longueurs)
		assert.deepEqual(page2, [[], [], [], liste.slice(20, 40)])
		// every profile on exactly one page, in order
		const pages = [1, 2, 3].flatMap(n =>
			sectionsDeLaPage(paginer(liste, n), longueurs).flat()
		)
		assert.deepEqual(pages, liste)
	})
})
