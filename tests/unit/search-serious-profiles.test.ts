/**
 * A serious profile is found even when its city is not recognised, has a typo or is missing (ticket 310;
 * decision of 22/10/2026 on the ambiguous cases of the import): it is only ranked lower. An import city
 * « to review » does not count in the search by place; a profile that is not serious is not shown.
 * Unit tests: made-up profiles, no database.
 */

import { describe, expect, test } from 'bun:test'
import { isFullyEmpty } from '@/lib/profile/completeness'
import { profileFields, profileState } from '@/lib/profile/state'
import { isList } from '@/lib/profile/visibility'
import type { GeoPoint } from '@/lib/search/geo-distance'
import { hasZone, zoneKnownFirst } from '@/lib/search/place'
import { type NormalizedTexts, normalizeTexts } from '@/lib/search/relevance'
import { find, type SearchableProfile } from '@/lib/search/results'
import { buildSearchView } from '@/lib/search/view'
import { directoryGeometry, directoryPlace } from '@/services/public/profiles'

type Fake = SearchableProfile & { nom: string }

const ANNECY: GeoPoint = { latitude: 45.8992, longitude: 6.1294 }
const NO_TEXT = { ville: '', specialite: '', description: '', competences: [], nom: '', prenom: '' }
const texts = (partial: Partial<NormalizedTexts> & Record<string, unknown>): NormalizedTexts =>
	normalizeTexts({
		...NO_TEXT,
		descriptionsDesCompetences: [],
		descriptionsDesPrestations: [],
		...partial,
	} as Parameters<typeof normalizeTexts>[0])

const known = (nom: string, extra: Partial<Fake> = {}): Fake => ({
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
// The profiles of the import whose city is not a commune of the list (cases 36, 48 and 82): no zone at all.
const zoneless = (nom: string, extra: Partial<Fake> = {}): Fake => ({
	nom,
	sortName: nom,
	ville: null,
	departement: null,
	seDeplace: false,
	postalCodes: [],
	center: null,
	radiusKm: null,
	...extra,
})
const names = (list: readonly { nom: string }[]): string[] => list.map(item => item.nom)

describe('310 : un profil sérieux sans zone reconnue reste trouvable', () => {
	test('trouvé par son nom et par sa spécialité, rangé après les profils à zone connue', () => {
		const directory: Fake[] = [
			zoneless('sans-zone', {
				textes: texts({ nom: 'Marchand', prenom: 'Camille', specialite: 'Maquillage de mariée' }),
			}),
			known('avec-zone', { textes: texts({ nom: 'Dupont', prenom: 'Lucie', specialite: 'Maquillage de mariée' }) }),
		]
		const byName = find(directory, { search: 'Marchand', city: '' })
		expect(names(byName.locaux)).toEqual(['sans-zone'])
		const bySpecialty = find(directory, { search: 'mariée', city: '' })
		expect(names(bySpecialty.locaux)).toEqual(['avec-zone', 'sans-zone'])
		// A typo is tolerated, as for any profile.
		expect(names(find(directory, { search: 'Marchnd', city: '' }).locaux)).toEqual(['sans-zone'])
	})

	test('une ville écrite en texte (zone de pays) est trouvée par ce texte', () => {
		const abroad = directoryPlace({
			city: {},
			radiusKm: null,
			zoneKind: 'countries',
			countries: ['BE'],
			town: 'Bruxelles',
		})
		expect(abroad.ville).toBe('Bruxelles (Belgique)')
		const directory: Fake[] = [
			{
				...zoneless('bruxelles', { textes: texts({ ville: abroad.ville ?? '', specialite: 'Mariage' }) }),
				ville: abroad.ville,
			},
			known('annecy', { textes: texts({ ville: 'Annecy', specialite: 'Mariage' }) }),
		]
		expect(names(find(directory, { search: 'Bruxelles', city: '' }).locaux)).toEqual(['bruxelles'])
	})

	test('avec une ville tapée : classés par distance, le profil sans zone est listé en dernier, jamais perdu', () => {
		const directory: Fake[] = [
			zoneless('sans-zone-a'),
			known('annecy', { radiusKm: 30, seDeplace: true }),
			zoneless('sans-zone-b', { unreachable: true }),
		]
		const origin = { point: ANNECY, label: 'Annecy' }
		const view = buildSearchView(
			directory,
			{ search: '', city: 'Annecy' },
			{ genre: 'point', point: ANNECY, label: 'Annecy' }
		)
		expect(names(view.places.locaux)).toEqual(['annecy'])
		expect(view.places.sections.map(({ cle }) => cle)).toEqual(['autres'])
		expect(names(view.places.sections[0]?.profils ?? [])).toEqual(['sans-zone-a', 'sans-zone-b'])
		expect(view.total).toBe(3)
		expect(find(directory, { search: '', city: 'Annecy' }, origin).locaux).toHaveLength(1)
	})

	test('avec une ville tapée non résolue : le profil sans zone passe après ceux qui ont une zone', () => {
		const directory: Fake[] = [
			zoneless('sans-zone'),
			known('ailleurs', { ville: 'Lyon', departement: '69' }),
			known('annecy'),
		]
		const result = find(directory, { search: '', city: 'Annecy' })
		expect(names(result.locaux)).toEqual(['annecy'])
		expect(names(result.sections.flatMap(({ profils }) => profils))).toEqual(['ailleurs', 'sans-zone'])
	})

	test('une ville seule où personne n’est près reste l’état vide, même si des profils sont sans zone', () => {
		const directory: Fake[] = [zoneless('sans-zone')]
		const view = buildSearchView(
			directory,
			{ search: '', city: 'Lyon' },
			{ genre: 'point', point: ANNECY, label: 'Lyon' }
		)
		expect(view.empty).toBe(true)
	})

	test('sans ville tapée : la zone connue passe d’abord, la pertinence départage ensuite', () => {
		const directory: Fake[] = [zoneless('sans-zone'), known('a'), known('b')]
		expect(names(find(directory, { search: '', city: '' }).locaux)).toEqual(['a', 'b', 'sans-zone'])
	})

	test('hasZone et zoneKnownFirst gardent l’ordre de chaque groupe', () => {
		expect(hasZone({ ville: null })).toBe(false)
		expect(hasZone({ ville: '  ' })).toBe(false)
		expect(hasZone({ ville: 'Annecy' })).toBe(true)
		const list = [
			{ ville: null, n: 1 },
			{ ville: 'A', n: 2 },
			{ ville: '', n: 3 },
			{ ville: 'B', n: 4 },
		]
		expect(zoneKnownFirst(list).map(({ n }) => n)).toEqual([2, 4, 1, 3])
	})
})

describe('310 : les villes à revoir de l’import n’entrent pas dans la recherche par lieu', () => {
	test('la revue de zone (raison, code postal, communes possibles) n’est jamais lue comme un lieu', () => {
		const imported = {
			city: {},
			radiusKm: null,
			zoneKind: null,
			countries: null,
			town: null,
			zoneReview: {
				reason: 'code-postal-partage',
				postalCode: '62149',
				candidates: [{ inseeCode: '62034', name: 'Annequin', department: '62' }],
			},
		}
		const place = directoryPlace(imported)
		expect(place).toEqual({ ville: null, departement: null, seDeplace: false, postalCodes: [] })
		expect(directoryGeometry(imported)).toEqual({ center: null, radiusKm: null })
		const profile: Fake = { nom: 'a-revoir', sortName: 'a-revoir', ...place, center: null, radiusKm: null }
		// Neither the postal code nor a possible commune finds her by place: she is only listed last.
		for (const city of ['62149', 'Annequin', '62']) {
			const result = find([profile, known('annecy')], { search: '', city })
			expect(names(result.locaux)).toEqual([])
		}
	})
})

describe('310 : le seuil de sérieux est la règle d’affichage existante', () => {
	const serious = {
		firstName: 'Camille',
		lastName: 'Marchand',
		specialty: 'Maquillage de mariée',
		description: 'x'.repeat(220),
		city: {},
		mainPicture: 12,
		serviceOffers: [{ priceFrom: 80 }],
		networks: { instagram: 'camille' },
	}

	test('un profil rempli dont la zone manque n’est pas vide : il est listé, sans être publiable', () => {
		expect(isFullyEmpty(profileFields(serious))).toBe(false)
		const state = profileState(serious)
		expect(state.fullyEmpty).toBe(false)
		expect(state.publishable).toBe(false)
		expect(isList({ status: 'published', available: true, fullyEmpty: state.fullyEmpty })).toBe(true)
	})

	test('un profil vide, ou réduit à un nom, n’est pas affiché', () => {
		for (const document of [{}, { firstName: 'Camille', lastName: 'Marchand' }]) {
			const state = profileState(document)
			expect(state.fullyEmpty).toBe(true)
			expect(isList({ status: 'draft', available: true, fullyEmpty: state.fullyEmpty })).toBe(false)
		}
	})
})
