/**
 * The search by city (ticket 098; plan 02 U17 and U19): what the visitor types, where the profiles of a
 * search are, and the sections of the page. Unit tests: no database, no server (the page itself is
 * tests/e2e/city-search.spec.ts).
 */

import { describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import {
	field,
	INPUT_MAX_LENGTH,
	PAGE_MAX,
	readPage,
	readSearch,
	resultsTitle,
	searchByCity,
	searchByWord,
	searchPageUrl,
	validSearch,
} from '@/lib/search/input'
import {
	municipalitiesOfPostalCodes,
	municipalitiesPhrase,
	type ProfilePlace,
	placeMatch,
	profilePlace,
	readPlace,
	sectionsByPlace,
} from '@/lib/search/place'
import { directoryPlace, readDirectory } from '@/services/public/profiles'

/** A profile for the sections: its commune, its département, and whether she travels. */
const profile = (nom: string, ville: string | null, departement: string | null, seDeplace = false) => ({
	nom,
	ville,
	departement,
	seDeplace,
})

const CITIES = [
	profile('annecy', 'Annecy', '74', true),
	profile('annecy-le-vieux', 'Annecy-le-Vieux', '74'),
	profile('annemasse', 'Annemasse', '74', true),
	profile('thonon', 'Thonon-les-Bains', '74'),
	profile('chambery', 'Chambéry', '73', true),
	profile('nantes', 'Nantes', '44'),
	profile('sans-ville', null, null),
]

const names = (profils: readonly { nom: string }[]): string[] => profils.map(p => p.nom)

describe('U17 : la saisie, normalisée', () => {
	test('un champ est rogné, ses espaces fusionnés, coupé à 100 caractères', () => {
		expect(field('  Annecy   le  Vieux ')).toBe('Annecy le Vieux')
		expect(field('x'.repeat(250))).toHaveLength(INPUT_MAX_LENGTH)
		expect(field(['Lyon', 'Paris'])).toBe('Lyon')
	})

	test('ce qui n’est pas un texte est un champ vide, jamais une erreur', () => {
		for (const value of [undefined, null, 42, {}, true, [], [undefined]]) expect(field(value)).toBe('')
	})

	test('l’adresse donne la recherche, un paramètre inconnu est ignoré', () => {
		expect(readSearch({ search: ' mariage ', city: ['Annecy', 'Lyon'], page: '3', x: 'y' })).toEqual({
			search: 'mariage',
			city: 'Annecy',
			page: 3,
		})
	})

	test('la casse, les accents et les traits d’union ne changent pas la ville trouvée', () => {
		const annecyOldTown = profilePlace({ ville: 'Annecy-le-Vieux', departement: '74' })
		for (const input of ['annecy', 'ANNECY', 'Annecy', '  annecy  ', 'Annecy le Vieux', 'annecy-le-vieux'])
			expect(placeMatch(annecyOldTown, readPlace(input)), input).toBe('ville')
		const evian = profilePlace({ ville: 'Évian-les-Bains', departement: '74' })
		for (const input of ['evian', 'Évian', 'EVIAN LES BAINS']) expect(placeMatch(evian, readPlace(input))).toBe('ville')
		const julienCity = profilePlace({ ville: 'Saint-Julien-en-Genevois', departement: '74' })
		for (const input of ['St Julien', 'saint julien', 'st-julien-en-genevois'])
			expect(placeMatch(julienCity, readPlace(input)), input).toBe('ville')
	})

	test('« Annecy » n’est pas « Annemasse », et un mot entier n’est pas un bout de mot', () => {
		expect(placeMatch(profilePlace({ ville: 'Annemasse', departement: '74' }), readPlace('annecy'))).toBeNull()
		expect(placeMatch(profilePlace({ ville: 'Lyon', departement: '69' }), readPlace('on'))).toBeNull()
		expect(placeMatch(profilePlace({ ville: 'Paris', departement: '75' }), readPlace('par'))).toBeNull()
	})

	test('un code postal, un code ou un nom de département disent le département', () => {
		expect(readPlace('74000 Annecy').departements).toEqual(['74'])
		expect(readPlace('Annecy (74)').departements).toEqual(['74'])
		expect(readPlace('2A').departements).toEqual(['2A'])
		expect(readPlace('974').departements).toEqual(['974'])
		expect(readPlace('Haute-Savoie').departements).toEqual(['74'])
		expect(readPlace('Corse').departements).toEqual(['2A', '2B'])
		const annecy = profilePlace({ ville: 'Annecy', departement: '74' })
		expect(placeMatch(annecy, readPlace('Haute-Savoie'))).toBe('departement')
		expect(placeMatch(annecy, readPlace('74'))).toBe('departement')
		expect(placeMatch(annecy, readPlace('73'))).toBeNull()
	})

	test('« Savoie » n’est pas « Haute-Savoie », ni « Loire » « Loire-Atlantique »', () => {
		const highSavoie = profilePlace({ ville: 'Haute-Savoie', departement: '74' })
		expect(placeMatch(highSavoie, readPlace('Savoie'))).toBeNull()
		const loireAtlantique = profilePlace({ ville: 'Loire-Atlantique', departement: '44' })
		expect(placeMatch(loireAtlantique, readPlace('Loire'))).toBeNull()
	})

	test('un pays ou une région ne compte que si rien de plus précis n’est écrit', () => {
		const annecy = profilePlace({ ville: 'Annecy', departement: '74' })
		expect(placeMatch(annecy, readPlace('Annecy, Suisse'))).toBe('ville')
		expect(placeMatch(profilePlace({ ville: 'Occitanie', departement: null }), readPlace('Occitanie'))).toBe('ville')
	})
})

describe('U18 : les paramètres de l’adresse, leurs défauts et leurs bornes', () => {
	test('sans paramètre : ni mot, ni ville, première page', () => {
		expect(readSearch({})).toEqual({ search: '', city: '', page: 1 })
	})

	test('la page est un entier de 1 à 1 000, sinon la première', () => {
		for (const [value, expected] of [
			['1', 1],
			['2', 2],
			['1000', 1000],
			['1001', 1],
			['0', 1],
			['-3', 1],
			['2.5', 1],
			['1e2', 1],
			['abc', 1],
			['', 1],
			[['4', '5'], 4],
			[undefined, 1],
			[7, 1],
			['99999', 1],
		] as const)
			expect(readPage(value), String(value)).toBe(expected)
		expect(PAGE_MAX).toBe(1000)
	})

	test('« specialite » dit ce que dit « search » quand « search » est vide, jamais l’inverse', () => {
		expect(readSearch({ specialite: 'mariage', city: 'Annecy' })).toMatchObject({ search: 'mariage' })
		expect(readSearch({ search: 'soirée', specialite: 'mariage' })).toMatchObject({ search: 'soirée' })
		expect(readSearch({ specialite: ['a', 'b'] })).toMatchObject({ search: 'a' })
	})

	test('un paramètre inconnu est ignoré', () => {
		expect(readSearch({ x: 'y', rayon: '30', limit: '500' })).toEqual({ search: '', city: '', page: 1 })
	})

	test('l’adresse de la page garde le mot et la ville, et laisse la première page sans paramètre', () => {
		expect(searchPageUrl({ search: 'mariage', city: 'Annecy', page: 1 })).toBe('/search?search=mariage&city=Annecy')
		expect(searchPageUrl({ search: 'mariage', city: 'Annecy', page: 3 })).toBe(
			'/search?search=mariage&city=Annecy&page=3'
		)
		expect(searchPageUrl({ search: 'été & soirée', page: 2 })).toBe(
			'/search?search=%C3%A9t%C3%A9+%26+soir%C3%A9e&page=2'
		)
		expect(searchPageUrl({ page: 2 })).toBe('/search?page=2')
		expect(searchPageUrl({ page: 99999 })).toBe(`/search?page=${PAGE_MAX}`)
	})
})

describe('U19 : sans critère, sans erreur', () => {
	test('une adresse sans paramètre n’est pas une recherche, et ne lève rien', () => {
		for (const parameters of [{}, { search: '', city: '' }, { search: '   ' }, { city: [] }, undefined]) {
			const search = readSearch(parameters)
			expect(validSearch(search)).toBe(false)
			expect(searchByCity(search)).toBe(false)
		}
	})

	test('la ville seule est une recherche par ville ; « France » n’est pas un lieu', () => {
		expect(searchByCity(readSearch({ city: 'Annecy' }))).toBe(true)
		expect(searchByCity(readSearch({ search: 'annecy', city: 'Annecy' }))).toBe(true)
		expect(searchByCity(readSearch({ city: 'France' }))).toBe(false)
		expect(searchByCity(readSearch({ city: 'Toute la France' }))).toBe(false)
	})

	test('un mot, seul ou avec une ville, est une recherche par mot et non par ville', () => {
		expect(validSearch(readSearch({ search: 'mariage' }))).toBe(true)
		expect(searchByCity(readSearch({ search: 'mariage' }))).toBe(false)
		expect(searchByCity(readSearch({ search: 'mariage', city: 'Annecy' }))).toBe(false)
		expect(searchByWord(readSearch({ search: 'mariage' }))).toBe(true)
		expect(searchByWord(readSearch({ search: 'mariage', city: 'Annecy' }))).toBe(true)
		// A mot with a place the page cannot rank by is still a word.
		expect(searchByWord(readSearch({ search: 'mariage', city: 'France' }))).toBe(true)
		// The city typed twice, or alone, is a search by city.
		expect(searchByWord(readSearch({ search: 'Annecy', city: 'annecy' }))).toBe(false)
		expect(searchByWord(readSearch({ city: 'Annecy' }))).toBe(false)
		expect(searchByWord(readSearch({}))).toBe(false)
	})

	test('sans lieu utilisable, une seule liste : tout le monde est « local »', () => {
		const result = sectionsByPlace(CITIES, 'France')
		expect(result.parLieu).toBe(false)
		expect(result.locaux).toHaveLength(CITIES.length)
		expect(result.sections).toEqual([])
		expect(sectionsByPlace([], 'Annecy').locaux).toEqual([])
	})
})

describe('les sections d’une recherche par ville', () => {
	test('d’abord la ville, puis le département tapé ; le titre ne compte qu’eux', () => {
		const result = sectionsByPlace(CITIES, 'Annecy')
		expect(names(result.locaux)).toEqual(['annecy', 'annecy-le-vieux'])
		expect(result.parLieu).toBe(true)
	})

	test('puis le même département, ceux qui se déplacent, le reste : chacun une fois', () => {
		const result = sectionsByPlace(CITIES, 'Annecy')
		expect(result.departements).toEqual(['74'])
		expect(result.sections.map(({ cle }) => cle)).toEqual(['departement', 'deplacent', 'autres'])
		expect(result.sections.map(({ titre }) => titre)).toEqual([
			'Autres maquilleuses du 74 (Haute-Savoie)',
			'Autres maquilleuses qui se déplacent',
			'Autres maquilleuses',
		])
		expect(names(result.sections[0]?.profils ?? [])).toEqual(['annemasse', 'thonon'])
		expect(names(result.sections[1]?.profils ?? [])).toEqual(['chambery'])
		expect(names(result.sections[2]?.profils ?? [])).toEqual(['nantes', 'sans-ville'])
		const everyone = [...result.locaux, ...result.sections.flatMap(section => section.profils)]
		expect(names(everyone).sort()).toEqual(names(CITIES).sort())
	})

	test('un département tapé donne ses profils d’abord, sans section du même département', () => {
		const result = sectionsByPlace(CITIES, 'Haute-Savoie')
		expect(names(result.locaux)).toEqual(['annecy', 'annecy-le-vieux', 'annemasse', 'thonon'])
		expect(result.sections.map(({ cle }) => cle)).toEqual(['deplacent', 'autres'])
	})

	test('sans profil de la ville, la page le dit : aucun local, et le département reste inconnu', () => {
		const result = sectionsByPlace(CITIES, 'Grenoble')
		expect(result.locaux).toEqual([])
		expect(result.departements).toEqual([])
		expect(result.sections.map(({ cle }) => cle)).toEqual(['deplacent', 'autres'])
	})

	test('le département d’une ville est celui de ses profils, le plus fréquent', () => {
		const profiles: ProfilePlace[] = [
			{ ville: 'Annecy', departement: '74', seDeplace: false },
			{ ville: 'Annecy', departement: '74', seDeplace: false },
			{ ville: 'Annecy-le-Vieux', departement: '74', seDeplace: false },
		]
		expect(sectionsByPlace(profiles, 'annecy').departements).toEqual(['74'])
	})
})

describe('le titre et l’adresse', () => {
	test('le titre dit ce qui a été tapé, jamais où sont les maquilleuses', () => {
		expect(resultsTitle({ search: '', city: 'Annecy' }, 3)).toBe('3 résultats pour « Annecy »')
		expect(resultsTitle({ search: 'annecy', city: 'Annecy' }, 1)).toBe('1 résultat pour « Annecy »')
		expect(resultsTitle({ search: 'mariage', city: 'Annecy' }, 2)).toBe('2 résultats pour « mariage » à « Annecy »')
		expect(resultsTitle({ search: 'zzqq', city: '' }, 0)).toBe('Aucun résultat pour « zzqq »')
	})

	test('l’adresse de la recherche laisse de côté les champs vides', () => {
		expect(searchPageUrl()).toBe('/search')
		expect(searchPageUrl({ city: ' Annecy  ' })).toBe('/search?city=Annecy')
		expect(searchPageUrl({ search: 'mariée', city: 'Paris' })).toBe('/search?search=mari%C3%A9e&city=Paris')
	})
})

describe('la lecture de l’annuaire', () => {
	function payloadSpy(pages: unknown[][]) {
		const readings: Record<string, unknown>[] = []
		const payload = {
			find: async (options: Record<string, unknown>) => {
				readings.push(options)
				if (options.collection === 'media')
					return {
						docs: [
							{ id: 4, url: 'https://photos.example.test/media/a.webp', width: 400, height: 400, filename: 'a.webp' },
						],
					}
				const page = Number(options.page)
				return { docs: pages[page - 1] ?? [], page, totalDocs: 0, hasNextPage: page < pages.length }
			},
		}
		return { payload: payload as unknown as Payload, lectures: readings }
	}

	const doc = (slug: string, extra: Record<string, unknown> = {}) => ({
		id: 1,
		slug,
		firstName: 'Zoé',
		lastName: 'Fictive',
		specialty: 'Mariage',
		city: { name: 'Annecy', inseeCode: '74010', department: '74', latitude: 45.9, longitude: 6.13 },
		radiusKm: 30,
		superArtist: false,
		mainPicture: {
			id: 4,
			url: 'https://photos.example.test/media/a.webp',
			width: 400,
			height: 400,
			filename: 'a.webp',
		},
		...extra,
	})

	test('il lit page après page, par cent, jusqu’à la dernière, sous les règles d’accès', async () => {
		const { payload, lectures: readings } = payloadSpy([[doc('a')], [doc('b')], [doc('c')]])

		const directory = await readDirectory(payload)

		expect(directory.map(({ carte }) => carte.slug)).toEqual(['a', 'b', 'c'])
		const profiles = readings.filter(lecture => lecture.collection === 'profiles' && lecture.overrideAccess === false)
		expect(profiles.map(({ page }) => page)).toEqual([1, 2, 3])
		for (const reading of profiles)
			expect(reading).toMatchObject({ collection: 'profiles', limit: 100, overrideAccess: false, depth: 0 })
	})

	test('il ne lit jamais plus de dix pages', async () => {
		const { payload, lectures: readings } = payloadSpy(Array.from({ length: 50 }, () => [doc('x')]))
		await readDirectory(payload)
		expect(
			readings.filter(lecture => lecture.collection === 'profiles' && lecture.overrideAccess === false)
		).toHaveLength(10)
	})

	test('la place d’un profil est sa commune et son département ; le centre de la commune reste hors de la carte (ticket 294)', async () => {
		const { payload } = payloadSpy([[doc('a'), doc('b', { city: null, radiusKm: 30 }), doc('c', { radiusKm: null })]])

		const [a, b, c] = await readDirectory(payload)

		expect(a).toMatchObject({ ville: 'Annecy', departement: '74', seDeplace: true })
		expect(b).toMatchObject({ ville: null, departement: null, seDeplace: false })
		expect(c).toMatchObject({ ville: 'Annecy', seDeplace: false })
		// The centre of the commune is read for the ranking by distance (ticket 294): beside the card, never in it.
		expect(a?.center).toEqual({ latitude: 45.9, longitude: 6.13 })
		expect(b?.center).toBeNull()
		const directory = await readDirectory(payload)
		const cards = JSON.stringify(directory.map(({ carte }) => carte))
		for (const forbidden of ['latitude', 'longitude', 'center', 'codeInsee', 'filename', '45.9'])
			expect(cards, forbidden).not.toContain(forbidden)
		expect(JSON.stringify(directory)).not.toContain('codeInsee')
	})

	test('avec les textes, chaque profil porte ce qu’une recherche par mot lit, à côté de sa carte et sans prix', async () => {
		const { payload, lectures: readings } = payloadSpy([
			[
				doc('a', {
					description: '  Je fais le maquillage de mariage.  ',
					skills: [{ name: 'Teint', description: 'Peau mate' }, { name: ' ' }, { description: 'Sans nom' }],
					serviceOffers: [
						{
							name: 'Mariée',
							description: 'Essai inclus',
							priceText: '150 €',
							priceFrom: 150,
							options: [{ name: 'Cils' }],
						},
						{ name: 'Soirée', description: null },
					],
				}),
			],
		])

		const [a] = await readDirectory(payload, { avecLesTextes: true })

		// Normalised once, at the read: no accent, lower case.
		expect(a?.textes).toEqual({
			ville: 'annecy',
			specialite: 'mariage',
			description: 'je fais le maquillage de mariage.',
			competences: ['teint'],
			descriptionsDesCompetences: ['peau mate', 'sans nom'],
			descriptionsDesPrestations: ['essai inclus'],
			nom: 'fictive',
			prenom: 'zoe',
		} as never)
		// The card is the same keys as without the texts (U22): the texts stay beside it.
		expect(Object.keys(a?.carte ?? {}).sort()).toEqual(
			Object.keys((await readDirectory(payload))[0]?.carte ?? {}).sort()
		)
		const select = readings.find(lecture => lecture.collection === 'profiles')?.select as Record<string, unknown>
		expect(Object.keys(select)).toEqual(expect.arrayContaining(['description', 'skills', 'serviceOffers']))
		for (const forbidden of ['contactDetails', 'publicContact', 'networks', 'internalNote', 'pro'])
			expect(select).not.toHaveProperty(forbidden)
		// Without the option, the texts are neither read nor carried.
		const without = (await readDirectory(payload))[0]
		expect(without).not.toHaveProperty('textes')
		expect(JSON.stringify(without)).not.toContain('150')
	})

	test('une photo qui n’est qu’un identifiant, ou sans adresse, donne une carte sans photo', async () => {
		const { payload } = payloadSpy([
			[doc('a', { mainPicture: 9 }), doc('b', { mainPicture: { id: 9 } }), doc('c', { mainPicture: null })],
		])
		const cards = (await readDirectory(payload)).map(({ carte }) => carte)
		expect(cards.map(({ photo }) => photo)).toEqual([null, null, null])
	})
})

// Ticket 263 (PLAN-ZONES.md §3.3 and §3.4): the postal code of a commune, and the countries.

/** Fictional communes: two share the postal code 74990, the others hold one code each. */
const WITH_CODES = [
	{ ...profile('valbrume', 'Valbrume', '74'), postalCodes: ['74990'] },
	{ ...profile('hautcombe', 'Hautcombe', '74'), postalCodes: ['74990'] },
	{ ...profile('annecy', 'Annecy', '74', true), postalCodes: ['74000'] },
	// No postal code stored yet: found by its département, as before.
	profile('sans-codes', 'Thonon-les-Bains', '74'),
	{ ...profile('nantes', 'Nantes', '44'), postalCodes: ['44000', '44100'] },
]

describe('263 : le code postal', () => {
	test('readPlace garde les codes postaux tapés, une fois chacun, et pas les autres nombres', () => {
		expect(readPlace('74990').postalCodes).toEqual(['74990'])
		expect(readPlace('Valbrume 74990, 74990 et 44000').postalCodes).toEqual(['74990', '44000'])
		expect(readPlace('Annecy 15e').postalCodes).toEqual([])
		expect(readPlace('749900').postalCodes).toEqual([])
		expect(readPlace('Annecy').postalCodes).toEqual([])
	})

	test('un code partagé met les profils de toutes ses communes au premier rang, le département ensuite', () => {
		const found = sectionsByPlace(WITH_CODES, '74990')
		expect(names(found.locaux)).toEqual(['valbrume', 'hautcombe', 'annecy', 'sans-codes'])
		expect(names(found.locaux.slice(0, 2))).toEqual(['valbrume', 'hautcombe'])
		for (const code of ['valbrume', 'hautcombe'])
			expect(placeMatch(profilePlace(WITH_CODES.find(p => p.nom === code) as never), readPlace('74990'))).toBe('ville')
		expect(placeMatch(profilePlace(WITH_CODES[2] as never), readPlace('74990'))).toBe('departement')
		expect(found.departements).toEqual(['74'])
	})

	test('un code d’une seule commune la trouve au premier rang, les autres du département suivent', () => {
		const found = sectionsByPlace(WITH_CODES, '74000')
		expect(names(found.locaux)).toEqual(['annecy', 'valbrume', 'hautcombe', 'sans-codes'])
		expect(names(sectionsByPlace(WITH_CODES, '44100').locaux)).toEqual(['nantes'])
	})

	test('un profil sans codes postaux enregistrés reste trouvé par son département', () => {
		const place = profilePlace(profile('sans-codes', 'Thonon-les-Bains', '74'))
		expect(placeMatch(place, readPlace('74990'))).toBe('departement')
		expect(placeMatch(place, readPlace('74000'))).toBe('departement')
	})

	test('le nom d’une commune et un code postal ensemble : le nom et le code classent tous deux au premier rang', () => {
		expect(names(sectionsByPlace(WITH_CODES, 'Nantes 74990').locaux.slice(0, 3))).toEqual([
			'valbrume',
			'hautcombe',
			'nantes',
		])
	})

	test('les communes sous le h1 viennent des profils trouvés par le code, dans leur ordre, une fois chacune', () => {
		const found = sectionsByPlace(WITH_CODES, '74990')
		expect(municipalitiesOfPostalCodes(found.locaux, '74990')).toEqual(['Valbrume', 'Hautcombe'])
		expect(municipalitiesOfPostalCodes([...found.locaux, ...found.locaux], '74990')).toEqual(['Valbrume', 'Hautcombe'])
		expect(municipalitiesOfPostalCodes(found.locaux, 'Annecy')).toEqual([])
		expect(municipalitiesOfPostalCodes(sectionsByPlace(WITH_CODES, '74000').locaux, '74000')).toEqual(['Annecy'])
	})

	test('la phrase des communes : une, deux, trois, aucune', () => {
		expect(municipalitiesPhrase(['Cambrin'])).toBe('Dans la commune de Cambrin.')
		expect(municipalitiesPhrase(['Cambrin', 'Cuinchy'])).toBe('Dans les communes de Cambrin et Cuinchy.')
		expect(municipalitiesPhrase(['Annequin', 'Cambrin', 'Cuinchy'])).toBe(
			'Dans les communes de Annequin, Cambrin et Cuinchy.'
		)
		expect(municipalitiesPhrase([])).toBe('')
	})
})

/** The place the directory gives a profile of countries. */
const abroad = (zone: Record<string, unknown>) => directoryPlace({ city: null, radiusKm: null, ...zone } as never)

describe('263 : les pays', () => {
	const belgium = { ...abroad({ zoneKind: 'countries', countries: ['BE'], town: 'Bruxelles' }), nom: 'belgique' }
	const belgiumAlone = { ...abroad({ zoneKind: 'countries', countries: ['BE'] }), nom: 'belgique-seule' }
	const frenchAndItalian = { ...abroad({ zoneKind: 'countries', countries: ['FR', 'IT'] }), nom: 'france-italie' }

	test('la place d’un profil de pays est son libellé, sans rayon, sans drapeau, sans département', () => {
		expect(belgium).toMatchObject({ ville: 'Bruxelles (Belgique)', departement: null, postalCodes: [] })
		expect(belgiumAlone.ville).toBe('Belgique')
		expect(frenchAndItalian.ville).toBe('France et Italie')
		for (const place of [belgium, belgiumAlone, frenchAndItalian])
			expect(place.ville).not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u)
	})

	test('« Belgique », « Bruxelles » et « Italie » tapés classent le profil au premier rang', () => {
		for (const input of ['Belgique', 'belgique', 'Bruxelles', 'Bruxelles, Belgique'])
			expect(placeMatch(profilePlace(belgium), readPlace(input)), input).toBe('ville')
		expect(placeMatch(profilePlace(belgiumAlone), readPlace('Belgique'))).toBe('ville')
		expect(placeMatch(profilePlace(belgiumAlone), readPlace('Bruxelles'))).toBeNull()
		expect(placeMatch(profilePlace(frenchAndItalian), readPlace('Italie'))).toBe('ville')
		expect(placeMatch(profilePlace(belgium), readPlace('Italie'))).toBeNull()
	})

	test('plusieurs pays comptent comme « se déplace » ; un pays seul seulement avec un rayon', () => {
		expect(frenchAndItalian.seDeplace).toBe(true)
		expect(belgiumAlone.seDeplace).toBe(false)
		expect(abroad({ zoneKind: 'countries', countries: ['BE'], radiusKm: 40 }).seDeplace).toBe(true)
		expect(abroad({ zoneKind: 'countries', countries: ['BE'], town: 'Bruxelles', radiusKm: 30 }).seDeplace).toBe(true)
	})

	test('une recherche française met un profil [FR, IT] sous « qui se déplacent » et jamais sous un département', () => {
		const directory = [profile('annecy', 'Annecy', '74'), belgium, belgiumAlone, frenchAndItalian]
		const found = sectionsByPlace(directory, 'Annecy')
		expect(names(found.locaux)).toEqual(['annecy'])
		expect(found.sections.map(({ cle }) => cle)).toEqual(['deplacent', 'autres'])
		expect(names(found.sections[0]?.profils ?? [])).toEqual(['france-italie'])
		expect(names(found.sections[1]?.profils ?? [])).toEqual(['belgique', 'belgique-seule'])
		const byDepartment = sectionsByPlace(directory, '74')
		expect(byDepartment.sections.find(({ cle }) => cle === 'departement')).toBeUndefined()
	})

	test('une commune garde sa place d’avant : nom, département, codes postaux, rayon', () => {
		expect(
			directoryPlace({ city: { name: 'Annecy', department: '74', postalCodes: ['74000'] }, radiusKm: 30 } as never)
		).toEqual({ ville: 'Annecy', departement: '74', seDeplace: true, postalCodes: ['74000'] })
		expect(directoryPlace({ city: null, radiusKm: 30 } as never)).toEqual({
			ville: null,
			departement: null,
			seDeplace: false,
			postalCodes: [],
		})
	})
})
