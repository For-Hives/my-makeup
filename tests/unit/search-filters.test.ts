/**
 * Filters and sort of the search (issue 1011): a ceiling on the starting price and a sort (price, last
 * update), both read from the address, combined with the sections by distance and with the pages. The
 * default view is the one of before. Unit tests: made-up profiles, no database.
 */

import { describe, expect, test } from 'bun:test'
import {
	DEFAULT_FILTERS,
	filtersActive,
	offeredSpecialties,
	priceBands,
	readFilters,
	readLayout,
} from '@/lib/search/filters'
import type { GeoPoint } from '@/lib/search/geo-distance'
import { searchPageUrl } from '@/lib/search/input'
import type { ResolvedPlace } from '@/lib/search/place-point'
import type { SearchableProfile } from '@/lib/search/results'
import { buildSearchView } from '@/lib/search/view'

type Fake = SearchableProfile & { nom: string }

const ANNECY: GeoPoint = { latitude: 45.8992, longitude: 6.1294 }
const POINT: ResolvedPlace = { genre: 'point', point: ANNECY, label: 'Annecy' }

const artist = (nom: string, extra: Partial<Fake> = {}): Fake => ({
	nom,
	sortName: nom,
	ville: 'Annecy',
	departement: '74',
	seDeplace: false,
	postalCodes: [],
	center: ANNECY,
	radiusKm: null,
	...extra,
})
const names = (list: readonly { nom: string }[]): string[] => list.map(item => item.nom)
const shown = (view: ReturnType<typeof buildSearchView<Fake>>): string[] =>
	names([...view.places.locaux, ...view.places.sections.flatMap(section => section.profils)])

describe('1011 : lecture des filtres dans l’adresse', () => {
	test('sans paramètre, ou avec une valeur inconnue, c’est la vue d’avant', () => {
		expect(readFilters({})).toEqual(DEFAULT_FILTERS)
		expect(readFilters({ specialty: null, maxPrice: 'abc', minPrice: '-3', sort: 'nimportequoi' })).toEqual(
			DEFAULT_FILTERS
		)
		expect(readFilters({ maxPrice: '3', minPrice: '20000', sort: '' })).toEqual(DEFAULT_FILTERS)
		expect(readFilters({ maxPrice: '77.5' })).toEqual(DEFAULT_FILTERS)
		expect(filtersActive(DEFAULT_FILTERS)).toBe(false)
	})

	test('un budget entier entre les bornes des prix est lu, même s’il n’est dans aucune tranche proposée (un lien partagé reste vrai)', () => {
		expect(readFilters({ maxPrice: '137', sort: 'price' })).toEqual({
			...DEFAULT_FILTERS,
			maxPrice: 137,
			sort: 'price',
		})
		expect(readFilters({ minPrice: '40', maxPrice: '120' })).toEqual({
			...DEFAULT_FILTERS,
			minPrice: 40,
			maxPrice: 120,
		})
		expect(readFilters({ maxPrice: ['100', '50'], sort: ['recent', 'price'] })).toEqual({
			...DEFAULT_FILTERS,
			maxPrice: 100,
			sort: 'recent',
		})
		expect(filtersActive({ ...DEFAULT_FILTERS, maxPrice: 100 })).toBe(true)
		expect(filtersActive({ ...DEFAULT_FILTERS, minPrice: 40 })).toBe(true)
		expect(filtersActive({ ...DEFAULT_FILTERS, sort: 'recent' })).toBe(true)
	})

	test('un minimum au-dessus du maximum est une demande vide : les deux sont gardés tels quels, rien n’est deviné', () => {
		expect(readFilters({ minPrice: '200', maxPrice: '100' })).toEqual({
			...DEFAULT_FILTERS,
			minPrice: 200,
			maxPrice: 100,
		})
	})

	test('l’adresse garde les filtres, et ne les écrit pas quand ils sont par défaut', () => {
		expect(searchPageUrl({ search: 'mariage', city: 'Annecy' })).toBe('/search?search=mariage&city=Annecy')
		expect(searchPageUrl({ city: 'Annecy', maxPrice: 100, sort: 'price', page: 2 })).toBe(
			'/search?city=Annecy&maxPrice=100&sort=price&page=2'
		)
		expect(searchPageUrl({ city: 'Annecy', minPrice: 50, maxPrice: 100 })).toBe(
			'/search?city=Annecy&minPrice=50&maxPrice=100'
		)
		expect(searchPageUrl({ city: 'Annecy', ...DEFAULT_FILTERS })).toBe('/search?city=Annecy')
	})

	test('la présentation (liste ou grille) est lue dans l’adresse : la liste est celle d’avant, la grille s’écrit', () => {
		expect(readLayout({})).toBe('list')
		expect(readLayout({ layout: 'grid' })).toBe('grid')
		expect(readLayout({ layout: ['grid', 'list'] })).toBe('grid')
		expect(readLayout({ layout: 'mosaic' })).toBe('list')
		expect(searchPageUrl({ city: 'Annecy', layout: 'grid' })).toBe('/search?city=Annecy&layout=grid')
		expect(searchPageUrl({ city: 'Annecy', layout: 'list' })).toBe('/search?city=Annecy')
	})
})

describe('budget : les tranches viennent des prix de départ réels', () => {
	const real = (...prices: number[]) => prices.map(startingPrice => ({ startingPrice }))

	test('trop peu de prix chiffrés : aucune tranche, la page ne devine rien', () => {
		expect(priceBands(real(40, 60, 80, 120, 200))).toEqual([])
		expect(priceBands([])).toEqual([])
		expect(priceBands([{ startingPrice: null }, {}, { startingPrice: undefined }])).toEqual([])
	})

	test('trois tranches coupées aux tiers des prix réels, arrondies, qui couvrent tout sans se chevaucher', () => {
		const bands = priceBands(real(30, 40, 45, 60, 70, 80, 90, 110, 130, 150, 200, 400))
		expect(bands.map(({ min, max }) => [min, max])).toEqual([
			[null, 69],
			[70, 129],
			[130, null],
		])
		expect(bands.map(({ label }) => label)).toEqual(['Moins de 70\u00a0€', 'De 70 à 129\u00a0€', '130\u00a0€ et plus'])
		for (const band of bands) expect(band.count).toBe(4)
	})

	test('des prix tous égaux, ou sans prix : aucune tranche, un filtre qui ne sépare personne n’aide personne', () => {
		expect(priceBands([...real(50, 50, 50, 50, 50, 50, 50, 50), { startingPrice: null }, {}])).toEqual([])
	})

	test('les profils sans prix ne comptent pour aucune tranche', () => {
		const bands = priceBands([...real(20, 30, 60, 80, 120, 300), { startingPrice: null }, {}])
		expect(bands.reduce((total, { count }) => total + count, 0)).toBe(6)
		for (const band of bands) expect(band.count).toBeGreaterThan(0)
	})

	test('une tranche sert de filtre : elle garde exactement les profils comptés', () => {
		const directory = real(30, 40, 45, 60, 70, 80, 90, 110, 130, 150, 200, 400).map((price, rank) => ({
			...artist(`p${rank}`),
			...price,
		}))
		for (const band of priceBands(directory)) {
			const view = buildSearchView(
				directory,
				{ search: '', city: '' },
				{ genre: 'unknown' },
				{ ...DEFAULT_FILTERS, minPrice: band.min, maxPrice: band.max }
			)
			expect(view.total).toBe(band.count)
		}
	})
})

describe('1011 : la spécialité', () => {
	const directory: Fake[] = [
		artist('mariage', { specialtyBullets: ['wedding'] }),
		artist('mariage-et-cinema', { specialtyBullets: ['wedding', 'screenStage'] }),
		artist('autre-seulement', { specialtyBullets: [] }),
		artist('sans-champ'),
	]

	test('une puce de la liste est lue dans l’adresse, une valeur inconnue est ignorée', () => {
		expect(readFilters({ specialty: 'wedding' }).specialty).toBe('wedding')
		expect(readFilters({ specialty: 'Mariage' }).specialty).toBeNull()
		expect(readFilters({ specialty: ['screenStage', 'wedding'] }).specialty).toBe('screenStage')
		expect(filtersActive({ ...DEFAULT_FILTERS, specialty: 'wedding' })).toBe(true)
		expect(searchPageUrl({ city: 'Annecy', specialty: 'wedding' })).toBe('/search?city=Annecy&specialty=wedding')
	})

	test('le filtre garde les profils qui ont choisi la puce, jamais ceux dont la spécialité est un texte libre', () => {
		const view = buildSearchView(directory, { search: '', city: 'Annecy' }, POINT, {
			...DEFAULT_FILTERS,
			specialty: 'screenStage',
		})
		expect(shown(view)).toEqual(['mariage-et-cinema'])
		const wedding = buildSearchView(directory, { search: '', city: 'Annecy' }, POINT, {
			...DEFAULT_FILTERS,
			specialty: 'wedding',
		})
		expect(shown(wedding).toSorted()).toEqual(['mariage', 'mariage-et-cinema'])
	})

	test('la page ne propose que les puces qu’au moins un profil listé a choisies, dans l’ordre de la liste', () => {
		expect(offeredSpecialties(directory)).toEqual([
			{ value: 'wedding', label: 'Mariage' },
			{ value: 'screenStage', label: 'Cinéma et scène' },
		])
		expect(offeredSpecialties([artist('a')])).toEqual([])
		expect(buildSearchView(directory, { search: '', city: 'Annecy' }, POINT).specialties).toHaveLength(2)
	})

	test('une puce que personne n’a choisie vide la recherche : l’état dit que ce sont les filtres', () => {
		const view = buildSearchView(directory, { search: '', city: 'Annecy' }, POINT, {
			...DEFAULT_FILTERS,
			specialty: 'specialEffects',
		})
		expect(view.filteredOut).toBe(true)
		expect(view.title).toBe('Aucune maquilleuse ne correspond à ces filtres')
	})
})

describe('1011 : le prix de départ', () => {
	const directory: Fake[] = [
		artist('chere', { startingPrice: 300 }),
		artist('moyenne', { startingPrice: 90 }),
		artist('bon-marche', { startingPrice: 40 }),
		artist('sur-devis'),
	]

	test('sans filtre, la vue est exactement celle d’avant', () => {
		const before = buildSearchView(directory, { search: '', city: 'Annecy' }, POINT)
		const withDefaults = buildSearchView(directory, { search: '', city: 'Annecy' }, POINT, DEFAULT_FILTERS)
		expect(withDefaults).toEqual(before)
		expect(shown(before)).toHaveLength(4)
	})

	test('un plafond garde les profils dont le prix de départ le respecte, jamais ceux sans prix', () => {
		const view = buildSearchView(directory, { search: '', city: 'Annecy' }, POINT, {
			specialty: null,
			minPrice: null,
			maxPrice: 100,
			sort: 'relevance',
		})
		expect(shown(view).toSorted()).toEqual(['bon-marche', 'moyenne'])
		expect(view.total).toBe(2)
	})

	test('le plafond se combine avec les sections de distance', () => {
		const far = artist('lointaine', {
			ville: 'Chambéry',
			departement: '73',
			center: { latitude: 45.5646, longitude: 5.9178 },
			startingPrice: 60,
		})
		const view = buildSearchView([...directory, far], { search: '', city: 'Annecy' }, POINT, {
			specialty: null,
			minPrice: null,
			maxPrice: 100,
			sort: 'relevance',
		})
		expect(names(view.places.locaux).toSorted()).toEqual(['bon-marche', 'moyenne'])
		expect(view.places.sections.flatMap(section => names(section.profils))).toEqual(['lointaine'])
	})
})

describe('1011 : le tri', () => {
	test('par prix, dans chaque section : le moins cher d’abord, sans prix à la fin', () => {
		const farAway = (nom: string, startingPrice?: number): Fake =>
			artist(nom, {
				ville: 'Chambéry',
				departement: '73',
				center: { latitude: 45.5646, longitude: 5.9178 },
				startingPrice,
			})
		const directory: Fake[] = [
			artist('a-120', { startingPrice: 120 }),
			artist('b-sans-prix'),
			artist('c-30', { startingPrice: 30 }),
			farAway('d-90', 90),
			farAway('e-20', 20),
		]
		const view = buildSearchView(directory, { search: '', city: 'Annecy' }, POINT, {
			specialty: null,
			minPrice: null,
			maxPrice: null,
			sort: 'price',
		})
		expect(names(view.places.locaux)).toEqual(['c-30', 'a-120', 'b-sans-prix'])
		// The sections stay what they were: the sort never mixes them.
		expect(view.places.sections.map(section => section.cle)).toEqual(['nearby'])
		expect(names(view.places.sections[0]?.profils ?? [])).toEqual(['e-20', 'd-90'])
	})

	test('par mise à jour : la plus récente d’abord', () => {
		const directory: Fake[] = [
			artist('ancienne', { updatedAt: 1000 }),
			artist('recente', { updatedAt: 3000 }),
			artist('moyenne', { updatedAt: 2000 }),
		]
		const view = buildSearchView(directory, { search: '', city: 'Annecy' }, POINT, {
			specialty: null,
			minPrice: null,
			maxPrice: null,
			sort: 'recent',
		})
		expect(names(view.places.locaux)).toEqual(['recente', 'moyenne', 'ancienne'])
	})

	test('un profil sans moyen de contact, ou sans zone, reste après les autres, quel que soit le tri', () => {
		const directory: Fake[] = [
			artist('sans-contact-pas-chere', { startingPrice: 10, unreachable: true }),
			artist('sans-zone-pas-chere', { startingPrice: 5, ville: null, departement: null, center: null }),
			artist('joignable-chere', { startingPrice: 500 }),
			artist('joignable-pas-chere', { startingPrice: 50 }),
		]
		const view = buildSearchView(
			directory,
			{ search: '', city: '' },
			{ genre: 'unknown' },
			{
				specialty: null,
				minPrice: null,
				maxPrice: null,
				sort: 'price',
			}
		)
		expect(names(view.places.locaux)).toEqual([
			'joignable-pas-chere',
			'joignable-chere',
			'sans-contact-pas-chere',
			'sans-zone-pas-chere',
		])
	})
})

describe('1011 : l’état vide d’un filtre', () => {
	const directory: Fake[] = [artist('chere', { startingPrice: 300 })]

	test('un filtre qui ne laisse personne ne dit pas que personne n’est inscrite près de la ville', () => {
		const view = buildSearchView(directory, { search: '', city: 'Annecy' }, POINT, {
			specialty: null,
			minPrice: null,
			maxPrice: 50,
			sort: 'relevance',
		})
		expect(view.empty).toBe(true)
		expect(view.filteredOut).toBe(true)
		expect(view.title).toBe('Aucune maquilleuse ne correspond à ces filtres')
		expect(view.far).toEqual([])
	})

	test('sans filtre, la ville sans personne garde son état d’avant', () => {
		const view = buildSearchView([], { search: '', city: 'Annecy' }, POINT, {
			specialty: null,
			minPrice: null,
			maxPrice: 50,
			sort: 'relevance',
		})
		expect(view.filteredOut).toBe(false)
		expect(view.title).toBe('Personne n’est encore inscrite près de Annecy.')
	})

	test('le total mesuré est celui de la recherche sans les filtres', () => {
		const many: Fake[] = [artist('a', { startingPrice: 300 }), artist('b', { startingPrice: 20 }), artist('c')]
		const view = buildSearchView(many, { search: '', city: 'Annecy' }, POINT, {
			specialty: null,
			minPrice: null,
			maxPrice: 50,
			sort: 'price',
		})
		expect(view.total).toBe(1)
		expect(view.baselineTotal).toBe(3)
	})
})
