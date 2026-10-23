import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { SearchResults } from '@/components/search/SearchResults'
import { NoResult, SearchFailed } from '@/components/search/SearchStates'
import type { GeoPoint } from '@/lib/search/geo-distance'
import { readSearch } from '@/lib/search/input'
import type { ResolvedPlace } from '@/lib/search/place-point'
import { FAR_TRAVELLERS_MAX, type SearchableProfile } from '@/lib/search/results'
import { buildSearchView } from '@/lib/search/view'
import type { DirectoryProfile, ProfileCard } from '@/services/public/profiles'
import { reachesFar } from '@/services/public/profiles'

/**
 * The search page tells the truth when nobody is near, and shows its three sections when somebody is
 * (ticket 295). Made-up profiles and centres only.
 */

type Fake = SearchableProfile & { nom: string; carte: ProfileCard }

const ANNECY: GeoPoint = { latitude: 45.8992, longitude: 6.1294 }
const OLD_ANNECY: GeoPoint = { latitude: 45.9183, longitude: 6.1445 }
const CHAMBERY: GeoPoint = { latitude: 45.5646, longitude: 5.9178 }
const LYON: GeoPoint = { latitude: 45.764, longitude: 4.8357 }
const PARIS: GeoPoint = { latitude: 48.8566, longitude: 2.3522 }
const NANTES: GeoPoint = { latitude: 47.2184, longitude: -1.5536 }

const card = (nom: string, lieu: string): ProfileCard => ({
	slug: nom,
	pid: 1 as never,
	nom,
	specialite: null,
	lieu,
	superMaquilleuse: false,
	photo: null,
})

const profile = (
	nom: string,
	ville: string,
	center: GeoPoint | null,
	radiusKm: number | null,
	extra: Partial<Fake> = {}
): Fake => ({
	nom,
	carte: card(nom, ville),
	sortName: nom,
	ville,
	departement: '74',
	seDeplace: radiusKm !== null,
	postalCodes: [],
	center,
	radiusKm,
	farReach: radiusKm !== null && radiusKm >= 100,
	...extra,
})

const point = (label: string, at: GeoPoint): ResolvedPlace => ({ genre: 'point', point: at, label })
const names = (list: readonly { nom: string }[]): string[] => list.map(item => item.nom)

// Nobody is near Lyon: the directory is in Haute-Savoie, Paris and Nantes.
const DIRECTORY: Fake[] = [
	profile('annecy-a', 'Annecy', ANNECY, 30),
	profile('annecy-b', 'Annecy-le-Vieux', OLD_ANNECY, 10),
	profile('chambery', 'Chambéry', CHAMBERY, null, { departement: '73' }),
	profile('paris-100', 'Paris', PARIS, 100, { departement: '75' }),
	profile('nantes-150', 'Nantes', NANTES, 150, { departement: '44' }),
	profile('nantes-sans-contact', 'Nantes', NANTES, 300, { departement: '44', unreachable: true }),
	profile('belgique-italie', 'France et Italie', null, null, { departement: null, seDeplace: true, farReach: true }),
	profile('lille-20', 'Lille', { latitude: 50.6292, longitude: 3.0573 }, 20, { departement: '59' }),
	profile('toulouse-100', 'Toulouse', { latitude: 43.6047, longitude: 1.4442 }, 100, { departement: '31' }),
	profile('marseille-50', 'Marseille', { latitude: 43.2965, longitude: 5.3698 }, 50, { departement: '13' }),
]

describe('295 : personne n’est près de la ville tapée', () => {
	const view = buildSearchView(DIRECTORY, { search: '', city: 'Lyon' }, point('Lyon', LYON))

	test('le titre dit la vérité et la page n’affiche pas la base', () => {
		expect(view.empty).toBe(true)
		expect(view.title).toBe('Personne n’est encore inscrite près de Lyon.')
		expect(view.total).toBe(0)
		expect(view.places.locaux).toEqual([])
		expect(view.places.sections).toEqual([])
	})

	test('au plus 4 profils à grand rayon, les joignables d’abord, les plus proches d’abord, aucun autre', () => {
		expect(view.far.length).toBeLessThanOrEqual(FAR_TRAVELLERS_MAX)
		expect(names(view.far)).toEqual(['toulouse-100', 'paris-100', 'nantes-150', 'belgique-italie'])
		for (const item of view.far) expect(item.farReach).toBe(true)
	})

	test('le rendu : le titre, les liens existants, l’inscription, puis exactement ces cartes', () => {
		const html = renderToStaticMarkup(
			<NoResult
				titre={view.title}
				search=""
				city="Lyon"
				departements={view.places.departements}
				loin={view.far.map(item => item.carte)}
			/>
		)
		expect(html).toContain(
			'<h1 class="font-bold text-2xl text-gray-800">Personne n’est encore inscrite près de Lyon.</h1>'
		)
		expect(html).toContain('href="/auth/signup"')
		expect(html).toContain('Elles se déplacent loin')
		expect(html.match(/href="\/profil\//g)).toHaveLength(4)
		for (const absent of ['annecy-a', 'chambery', 'lille-20', 'marseille-50', 'nantes-sans-contact'])
			expect(html).not.toContain(`/profil/${absent}`)
		expect(html).not.toContain('Aucun résultat')
	})

	test('sans profil à grand rayon : pas de section « Elles se déplacent loin »', () => {
		const html = renderToStaticMarkup(
			<NoResult titre="Personne n’est encore inscrite près de Lyon." search="" city="Lyon" />
		)
		expect(html).not.toContain('Elles se déplacent loin')
	})
})

describe('295 : quelqu’un est près de la ville tapée', () => {
	const query = { search: '', city: 'Annecy-le-Vieux', page: 1 }
	const view = buildSearchView(
		[...DIRECTORY, profile('vieux-c', 'Annecy-le-Vieux', OLD_ANNECY, null)],
		query,
		point('Annecy-le-Vieux', OLD_ANNECY)
	)

	test('les trois sections s’affichent avec leurs titres, et le titre compte tout ce qui est montré', () => {
		expect(view.empty).toBe(false)
		expect(view.title).toBe('4 résultats pour « Annecy-le-Vieux »')
		const html = renderToStaticMarkup(<SearchResults vue={view as never} recherche={query} />)
		const titles = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map(match => match[1])
		expect(titles).toEqual(['À Annecy-le-Vieux', 'Se déplacent jusqu’à vous', 'Plus loin, à moins de 50 km'])
		expect(html).not.toContain('sr-only')
	})
})

describe('295 : le lieu n’est pas connu', () => {
	test('une ville étrangère donne l’explication, avec le pays quand on le connaît', () => {
		const view = buildSearchView(DIRECTORY, { search: '', city: 'Genève' }, { genre: 'unknown' })
		expect(view.empty).toBe(true)
		expect(view.foreignCity).toBe(true)
		expect(view.foreignCountry).toBe('Suisse')
		expect(view.title).toBe('Personne n’est encore inscrite près de Genève.')
		const html = renderToStaticMarkup(
			<NoResult titre={view.title} search="" city="Genève" foreignCity foreignCountry="Suisse" />
		)
		expect(html).toContain('seuls les pays sont lus')
		expect(html).toContain('href="/search?city=Suisse"')
	})

	test('le référentiel en panne : pas d’explication d’étranger, mais la même vérité', () => {
		const view = buildSearchView(DIRECTORY, { search: '', city: 'Genève' }, { genre: 'unavailable' })
		expect(view.empty).toBe(true)
		expect(view.foreignCity).toBe(false)
	})

	test('le nom d’un pays trouve encore ses profils, un profil sur plusieurs pays aussi', () => {
		const abroad = [
			profile('bruxelles', 'Bruxelles (Belgique)', null, null, { departement: null }),
			profile('multi', 'France et Italie', null, null, { departement: null, seDeplace: true, farReach: true }),
		]
		expect(
			names(buildSearchView(abroad, { search: '', city: 'Belgique' }, { genre: 'unknown' }).places.locaux)
		).toEqual(['bruxelles'])
		expect(names(buildSearchView(abroad, { search: '', city: 'Italie' }, { genre: 'unknown' }).places.locaux)).toEqual([
			'multi',
		])
	})

	test('un lieu inconnu où une maquilleuse indique la ville garde la recherche par le nom', () => {
		const view = buildSearchView(DIRECTORY, { search: '', city: 'Annecy' }, { genre: 'unknown' })
		expect(view.ranked).toBe(false)
		expect(names(view.places.locaux)).toEqual(['annecy-a', 'annecy-b'])
		expect(view.title).toBe('2 résultats pour « Annecy »')
	})
})

describe('295 : une recherche avec un mot garde son titre', () => {
	test('mot et ville sans personne : « Aucun résultat pour … », jamais « Personne n’est… »', () => {
		const view = buildSearchView([], { search: 'mariage', city: 'Lyon' }, point('Lyon', LYON))
		expect(view.title).toBe('Aucun résultat pour « mariage » à « Lyon »')
		expect(view.far).toEqual([])
	})
})

describe('295 : qui se déplace loin', () => {
	test('un rayon d’au moins 100 km, ou plusieurs pays', () => {
		const base = { zoneKind: 'city', countries: [], town: null } as never
		expect(reachesFar({ ...(base as object), radiusKm: 99 } as never)).toBe(false)
		expect(reachesFar({ ...(base as object), radiusKm: 100 } as never)).toBe(true)
		expect(reachesFar({ ...(base as object), radiusKm: null } as never)).toBe(false)
		expect(reachesFar({ zoneKind: 'countries', countries: ['BE', 'IT'], radiusKm: null, town: null } as never)).toBe(
			true
		)
		expect(reachesFar({ zoneKind: 'countries', countries: ['BE'], radiusKm: null, town: null } as never)).toBe(false)
	})
})

describe('295 : la panne du référentiel de profils', () => {
	test('« Réessayer » reste en place', () => {
		const html = renderToStaticMarkup(<SearchFailed recherche={readSearch({ city: 'Lyon' })} />)
		expect(html).toContain('La recherche n’a pas abouti')
		expect(html).toContain('Réessayer')
		expect(html).toContain('href="/search?city=Lyon"')
	})
})

// Keeps the type honest: the directory of the service is what the view reads.
const _check: (annuaire: DirectoryProfile[]) => unknown = annuaire =>
	buildSearchView(annuaire, { search: '', city: '' }, { genre: 'unknown' })
void _check
