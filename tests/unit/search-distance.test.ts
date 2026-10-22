import { describe, expect, test } from 'bun:test'
import type { GeoPoint } from '@/lib/search/geo-distance'
import type { NormalizedTexts } from '@/lib/search/relevance'
import { normalizeTexts } from '@/lib/search/relevance'
import { find, type SearchableProfile } from '@/lib/search/results'
import { directoryGeometry } from '@/services/public/profiles'

/**
 * The results ranked by distance (ticket 294): at the commune, then the zone that covers the client,
 * then farther away within 50 km. Made-up profiles and centres only.
 */

type Fake = SearchableProfile & { nom: string }

const ANNECY: GeoPoint = { latitude: 45.8992, longitude: 6.1294 }
const OLD_ANNECY: GeoPoint = { latitude: 45.9183, longitude: 6.1445 }
const CHAMBERY: GeoPoint = { latitude: 45.5646, longitude: 5.9178 }
const AIX: GeoPoint = { latitude: 45.6886, longitude: 5.915 }
const GRENOBLE: GeoPoint = { latitude: 45.1885, longitude: 5.7245 }
const LYON: GeoPoint = { latitude: 45.764, longitude: 4.8357 }

const profile = (
	nom: string,
	ville: string,
	center: GeoPoint | null,
	radiusKm: number | null,
	extra: Partial<Fake> = {}
): Fake => ({
	nom,
	sortName: nom,
	ville,
	departement: '74',
	seDeplace: radiusKm !== null,
	postalCodes: [],
	center,
	radiusKm,
	...extra,
})

const FIVE_OF_ANNECY = ['b', 'a', 'e', 'c', 'd'].map(letter => profile(`annecy-${letter}`, 'Annecy', ANNECY, 30))

const names = (list: readonly { nom: string }[]): string[] => list.map(item => item.nom)
const origin = { point: OLD_ANNECY, label: 'Annecy-le-Vieux' }

describe('294 : le classement par distance', () => {
	const DIRECTORY: Fake[] = [
		...FIVE_OF_ANNECY,
		profile('lyon-sans-deplacement', 'Lyon', LYON, null, { departement: '69' }),
		profile('grenoble-100', 'Grenoble', GRENOBLE, 100, { departement: '38' }),
		profile('chambery-sans', 'Chambéry', CHAMBERY, null, { departement: '73' }),
		profile('aix-10', 'Aix-les-Bains', AIX, 10, { departement: '73' }),
	]

	test('« Annecy-le-Vieux » : les cinq d’Annecy à 30 km sous « Se déplacent jusqu’à vous »', () => {
		const result = find(DIRECTORY, { search: '', city: 'Annecy-le-Vieux' }, origin)
		expect(result.locaux).toEqual([])
		expect(result.sections.map(({ cle, titre }) => [cle, titre])).toEqual([
			['covering', 'Se déplacent jusqu’à vous'],
			['nearby', 'Plus loin, à moins de 50 km'],
		])
		const covering = result.sections[0]?.profils ?? []
		expect(
			names(covering)
				.filter(nom => nom.startsWith('annecy-'))
				.sort()
		).toEqual(['annecy-a', 'annecy-b', 'annecy-c', 'annecy-d', 'annecy-e'])
		expect(names(covering)).toContain('grenoble-100')
	})

	test('un profil à 120 km qui ne se déplace pas n’apparaît dans aucune section', () => {
		const result = find(DIRECTORY, { search: '', city: 'Annecy-le-Vieux' }, origin)
		const all = [...result.locaux, ...result.sections.flatMap(section => section.profils)]
		expect(names(all)).not.toContain('lyon-sans-deplacement')
	})

	test('un rayon trop court passe « plus loin », et un profil sans rayon à moins de 50 km aussi', () => {
		const result = find(DIRECTORY, { search: '', city: 'Annecy-le-Vieux' }, origin)
		expect(names(result.sections[1]?.profils ?? [])).toEqual(['aix-10', 'chambery-sans'])
	})

	test('dans une section : distance croissante, puis pertinence, puis nom', () => {
		const result = find(DIRECTORY, { search: '', city: 'Annecy-le-Vieux' }, origin)
		const covering = names(result.sections[0]?.profils ?? [])
		// The five of Annecy are at the same distance: by name. Grenoble (about 80 km) is last.
		expect(covering).toEqual(['annecy-a', 'annecy-b', 'annecy-c', 'annecy-d', 'annecy-e', 'grenoble-100'])
		const nearer = [
			profile('zoe', 'Annecy', ANNECY, 30),
			profile('ada', 'Annecy', { latitude: 45.95, longitude: 6.2 }, 30),
		]
		expect(names(find(nearer, { search: '', city: 'Annecy-le-Vieux' }, origin).sections[0]?.profils ?? [])).toEqual([
			'zoe',
			'ada',
		])
	})

	test('à égalité de distance, la pertinence du mot passe avant le nom', () => {
		const texts = (specialty: string): NormalizedTexts =>
			normalizeTexts({
				ville: 'Annecy',
				specialite: specialty,
				description: '',
				competences: [],
				descriptionsDesCompetences: [],
				descriptionsDesPrestations: [],
				nom: '',
				prenom: '',
			})
		const directory = [
			profile('a-moins-bon', 'Annecy', ANNECY, 30, { textes: texts('marriage') }),
			profile('z-meilleur', 'Annecy', ANNECY, 30, { textes: texts('mariage') }),
		]
		const result = find(directory, { search: 'mariage', city: 'Annecy-le-Vieux' }, origin)
		expect(names(result.sections[0]?.profils ?? [])).toEqual(['z-meilleur', 'a-moins-bon'])
	})

	test('les profils de la commune tapée viennent d’abord, par distance, dans « À <lieu> »', () => {
		const directory = [
			profile('ailleurs', 'Annecy', ANNECY, 30),
			profile('ici-b', 'Annecy-le-Vieux', OLD_ANNECY, null),
			profile('ici-a', 'Annecy-le-Vieux', OLD_ANNECY, 5),
		]
		const result = find(directory, { search: '', city: 'Annecy-le-Vieux' }, origin)
		expect(names(result.locaux)).toEqual(['ici-a', 'ici-b'])
		expect(result.localTitle).toBe('À Annecy-le-Vieux')
		expect(names(result.sections[0]?.profils ?? [])).toEqual(['ailleurs'])
	})

	test('une commune sans coordonnées reste trouvée par son nom, et n’est jamais rangée « plus loin »', () => {
		const directory = [
			profile('sans-point', 'Annecy-le-Vieux', null, 20),
			profile('autre-sans-point', 'Chambéry', null, 20, { departement: '73' }),
		]
		const result = find(directory, { search: '', city: 'Annecy-le-Vieux' }, origin)
		expect(names(result.locaux)).toEqual(['sans-point'])
		const all = result.sections.flatMap(section => section.profils)
		expect(names(all)).toEqual([])
	})

	test('les profils sans contact passent en fin de section (291), la distance d’abord', () => {
		const directory = [
			profile('a-sans', 'Annecy', ANNECY, 30, { unreachable: true }),
			profile('b-ok', 'Annecy', ANNECY, 30),
		]
		const result = find(directory, { search: '', city: 'Annecy-le-Vieux' }, origin)
		expect(names(result.sections[0]?.profils ?? [])).toEqual(['b-ok', 'a-sans'])
	})

	test('lieu inconnu : le comportement d’avant, sections par nom et département', () => {
		const withoutOrigin = find(DIRECTORY, { search: '', city: 'Annecy' }, null)
		const before = find(DIRECTORY, { search: '', city: 'Annecy' })
		expect(withoutOrigin).toEqual(before)
		expect(before.sections.map(({ cle }) => cle)).not.toContain('covering')
	})

	test('un simple code de département garde les sections d’avant, même avec un point', () => {
		const result = find(DIRECTORY, { search: '', city: '74' }, origin)
		expect(result.sections.map(({ cle }) => cle)).not.toContain('covering')
	})
})

describe('294 : le temps du classement', () => {
	test('200 profils fictifs sont classés en moins de 50 ms', () => {
		const many = Array.from({ length: 200 }, (_, i) =>
			profile(
				`p${String(i).padStart(3, '0')}`,
				`Ville ${i}`,
				{ latitude: 45 + (i % 20) * 0.05, longitude: 6 + (i % 7) * 0.05 },
				i % 3 === 0 ? 30 : null
			)
		)
		const start = performance.now()
		const result = find(many, { search: '', city: 'Annecy-le-Vieux' }, origin)
		const elapsed = performance.now() - start
		expect(result.sections.flatMap(section => section.profils).length).toBeGreaterThan(0)
		expect(elapsed).toBeLessThan(50)
	})
})

describe('294 : le centre et le rayon lus sur un profil', () => {
	test('une commune avec ses coordonnées et son rayon', () => {
		const city = { name: 'Annecy', department: '74', latitude: 45.9, longitude: 6.13 }
		expect(directoryGeometry({ city, radiusKm: 30 } as never)).toEqual({
			center: { latitude: 45.9, longitude: 6.13 },
			radiusKm: 30,
		})
	})

	test('une commune sans coordonnées : pas de centre, jamais zéro zéro', () => {
		const city = { name: 'Annecy', department: '74', latitude: null, longitude: null }
		expect(directoryGeometry({ city, radiusKm: 30 } as never).center).toBeNull()
	})

	test('une zone à l’étranger ou pas de commune : ni centre ni rayon', () => {
		expect(directoryGeometry({ city: null, radiusKm: 30 } as never)).toEqual({ center: null, radiusKm: null })
		expect(directoryGeometry({ city: null, zoneKind: 'countries', countries: ['BE'], radiusKm: 40 } as never)).toEqual({
			center: null,
			radiusKm: null,
		})
	})
})
