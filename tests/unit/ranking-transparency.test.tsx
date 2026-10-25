/**
 * The page that explains the ranking says what the code does, and only that (issue 1012). `RANKING_RULES`
 * (src/lib/search/ranking.ts) is the one source of the page; this file has one check for every rule, which plays it
 * against the code that ranks, and the page is rendered from the same rules. A rule added without its check
 * does not type; a rule the code does not follow fails its check. Nothing paid enters the ranking.
 * Made-up profiles, no database.
 */

import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfileBlock } from '@/components/blocks/ProfileBlock'
import { RankingExplainer } from '@/components/ranking/RankingExplainer'
import { SearchResults } from '@/components/search/SearchResults'
import { NoResult } from '@/components/search/SearchStates'
import { BADGE_ANCHOR, BADGE_EXPLANATION, BADGE_NO_BONUS, BADGE_TITLE } from '@/lib/activity/badge-text'
import { isList } from '@/lib/profile/visibility'
import type { GeoPoint } from '@/lib/search/geo-distance'
import { paginate } from '@/lib/search/pagination'
import { NEARBY_MAX_KM } from '@/lib/search/place'
import type { ResolvedPlace } from '@/lib/search/place-point'
import {
	MOST_VIEWED_MIN_PROFILES,
	MOST_VIEWED_MIN_VIEWS,
	orderMostViewed,
	PRESET_SIZE,
	selectPreset,
} from '@/lib/search/preset'
import {
	DIRECTORY_SORT,
	RANKING_EXCLUDED,
	RANKING_GROUPS,
	RANKING_LINK_TEXT,
	RANKING_PATH,
	RANKING_RULES,
	type RankingRuleId,
} from '@/lib/search/ranking'
import { normalizeTexts } from '@/lib/search/relevance'
import { FAR_TRAVELLERS_MAX, find, type SearchableProfile } from '@/lib/search/results'
import { buildSearchView } from '@/lib/search/view'
import { profileBlockCards } from '@/services/public/profile-block'
import { type DirectoryProfile, readDirectory } from '@/services/public/profiles'

const ANNECY: GeoPoint = { latitude: 45.8992, longitude: 6.1294 }
const OLD_ANNECY: GeoPoint = { latitude: 45.9183, longitude: 6.1445 }
const CHAMBERY: GeoPoint = { latitude: 45.5646, longitude: 5.9178 }
const PARIS: GeoPoint = { latitude: 48.8566, longitude: 2.3522 }
const POINT: ResolvedPlace = { genre: 'point', point: ANNECY, label: 'Annecy' }

type Fake = DirectoryProfile & { nom: string }

const texts = (specialty = '', description = '', city = 'Annecy') =>
	normalizeTexts({
		ville: city,
		specialite: specialty,
		description,
		competences: [],
		descriptionsDesCompetences: [],
		descriptionsDesPrestations: [],
		nom: '',
		prenom: '',
	})

const artist = (nom: string, extra: Partial<Fake> = {}): Fake => ({
	nom,
	carte: { slug: nom, pid: 1 as never, nom, specialite: null, lieu: 'Annecy', superMaquilleuse: false, photo: null },
	sortName: nom,
	ville: 'Annecy',
	departement: '74',
	seDeplace: false,
	postalCodes: [],
	center: ANNECY,
	radiusKm: null,
	farReach: false,
	unreachable: false,
	indexable: true,
	textes: texts(),
	...extra,
})
const names = (list: readonly { nom: string }[]): string[] => list.map(item => item.nom)
const order = (view: ReturnType<typeof buildSearchView<Fake>>): string[] =>
	names([...view.places.locaux, ...view.places.sections.flatMap(section => section.profils)])
const byPoint = (directory: Fake[], search = '') => buildSearchView(directory, { search, city: 'Annecy' }, POINT)
const noCity = (directory: Fake[], search = '') =>
	buildSearchView(directory, { search, city: '' }, { genre: 'unknown' })

/** One check per rule: each one plays what the text of the rule says against the code. */
const CHECKS: Record<RankingRuleId, () => void> = {
	listed: () => {
		expect(isList({ status: 'published' })).toBe(true)
		expect(isList({ status: 'hidden' })).toBe(false)
		expect(isList({ available: false })).toBe(false)
		expect(isList({ fullyEmpty: true })).toBe(false)
	},
	words: () => {
		const directory = [
			artist('mariage', { textes: texts('Maquillage mariage') }),
			artist('soiree', { textes: texts('Maquillage soirée') }),
		]
		expect(names(find(directory, { search: 'mariage', city: '' }).locaux)).toEqual(['mariage'])
		expect(names(find(directory, { search: 'MARIAGE', city: '' }).locaux)).toEqual(['mariage'])
		expect(names(find(directory, { search: 'soiree', city: '' }).locaux)).toEqual(['soiree'])
		// A typo for 5 letters; the request itself and the small words are ignored.
		expect(names(find(directory, { search: 'mariag', city: '' }).locaux)).toEqual(['mariage'])
		expect(names(find(directory, { search: 'je cherche une maquilleuse pour mon mariage', city: '' }).locaux)).toEqual([
			'mariage',
		])
		// Every important word is required.
		expect(find(directory, { search: 'mariage soiree', city: '' }).locaux).toEqual([])
	},
	'city-keeps': () => {
		const zoneless = artist('sans-zone', {
			ville: null,
			departement: null,
			center: null,
			textes: texts('Mariage', '', ''),
		})
		const known = artist('connue', { textes: texts('Mariage') })
		// Found by her speciality, after the profile whose zone is known; with a city or without.
		expect(names(noCity([zoneless, known], 'mariage').places.locaux)).toEqual(['connue', 'sans-zone'])
		expect(order(byPoint([zoneless, known], 'mariage'))).toEqual(['connue', 'sans-zone'])
	},
	'nobody-near': () => {
		const directory = [artist('lyon', { ville: 'Lyon', departement: '69', center: null })]
		const view = buildSearchView(directory, { search: '', city: 'Annecy' }, { genre: 'unknown' })
		expect(view.empty).toBe(true)
		expect(view.places.sections).toEqual([])
	},
	'sections-point': () => {
		const directory = [
			artist('commune'),
			artist('couvre', { ville: 'Chambéry', departement: '73', center: CHAMBERY, seDeplace: true, radiusKm: 100 }),
			artist('plus-loin', { ville: 'Chambéry', departement: '73', center: CHAMBERY }),
			artist('trop-loin', { ville: 'Paris', departement: '75', center: PARIS }),
			artist('sans-zone', { ville: null, departement: null, center: null }),
		]
		const view = byPoint(directory)
		expect(names(view.places.locaux)).toEqual(['commune'])
		expect(view.places.sections.map(section => [section.cle, names(section.profils)])).toEqual([
			['covering', ['couvre']],
			['nearby', ['plus-loin']],
			['autres', ['sans-zone']],
		])
		expect(order(view)).not.toContain('trop-loin')
		expect(NEARBY_MAX_KM).toBe(50)
	},
	'sections-text': () => {
		const directory = [
			artist('ailleurs', { ville: 'Paris', departement: '75', center: null }),
			artist('voyage', { ville: 'Paris', departement: '75', center: null, seDeplace: true }),
			artist('departement', { ville: 'Chambéry', departement: '74', center: null }),
			artist('annecy', { center: null }),
		]
		const view = buildSearchView(directory, { search: '', city: '74' }, { genre: 'unknown' })
		expect(names(view.places.locaux).toSorted()).toEqual(['annecy', 'departement'])
		expect(view.places.sections.map(section => [section.cle, names(section.profils)])).toEqual([
			['deplacent', ['voyage']],
			['autres', ['ailleurs']],
		])
	},
	'zone-first': () => {
		const directory = [
			artist('sans-zone-joignable', { ville: null, departement: null, center: null }),
			artist('zone-sans-contact', { unreachable: true }),
		]
		expect(order(noCity(directory))).toEqual(['zone-sans-contact', 'sans-zone-joignable'])
	},
	'reachable-first': () => {
		const directory = [artist('sans-contact', { unreachable: true }), artist('joignable')]
		expect(order(noCity(directory))).toEqual(['joignable', 'sans-contact'])
		expect(order(byPoint(directory))).toEqual(['joignable', 'sans-contact'])
	},
	distance: () => {
		const directory = [
			artist('vieux', { ville: 'Annecy-le-Vieux', center: OLD_ANNECY, seDeplace: true, radiusKm: 30 }),
			artist('centre', { seDeplace: true, radiusKm: 30 }),
		]
		const far = artist('chambery', {
			ville: 'Chambéry',
			departement: '73',
			center: CHAMBERY,
			seDeplace: true,
			radiusKm: 100,
		})
		const view = byPoint([far, ...directory])
		expect(view.places.sections.find(section => section.cle === 'covering')).toBeDefined()
		const near = [artist('b-vieux', { center: OLD_ANNECY }), artist('a-centre', { center: ANNECY })]
		expect(names(byPoint(near).places.locaux)).toEqual(['a-centre', 'b-vieux'])
		expect(names(byPoint([near[1] as Fake, near[0] as Fake]).places.locaux)).toEqual(['a-centre', 'b-vieux'])
		// Her commune without coordinates, in the département, comes after those whose commune is known.
		const noCoordinates = artist('a-sans-coordonnees', { ville: 'Annecy', center: null })
		expect(names(byPoint([noCoordinates, ...near]).places.locaux)).toEqual([
			'a-centre',
			'b-vieux',
			'a-sans-coordonnees',
		])
	},
	'word-quality': () => {
		const exact = artist('z-exacte', { textes: texts('Maquillage mariage') })
		const loose = artist('a-diluee', {
			textes: texts('Soin', 'Je fais aussi du maquillage de mariage pour des clientes très diverses dans la région'),
		})
		// Without a city the best match is first, whatever the name or the directory order.
		expect(names(noCity([loose, exact], 'mariage').places.locaux)).toEqual(['z-exacte', 'a-diluee'])
		// With a city, the distance comes first and the words decide at the same distance.
		const near = artist('b-pres-diluee', { center: ANNECY, textes: loose.textes })
		const nearExact = artist('c-pres-exacte', { center: ANNECY, textes: exact.textes })
		const old = artist('a-loin-exacte', { center: OLD_ANNECY, textes: exact.textes })
		expect(names(byPoint([old, near, nearExact], 'mariage').places.locaux)).toEqual([
			'c-pres-exacte',
			'b-pres-diluee',
			'a-loin-exacte',
		])
	},
	name: () => {
		const directory = [artist('b-nom'), artist('a-nom')]
		expect(names(byPoint(directory).places.locaux)).toEqual(['a-nom', 'b-nom'])
	},
	completeness: () => {
		// The order of the directory is the order of a search without a city: it is the one the read asks for.
		const directory = [artist('premiere'), artist('seconde')]
		expect(names(noCity(directory).places.locaux)).toEqual(['premiere', 'seconde'])
		expect(DIRECTORY_SORT[0]).toBe('-completeness')
	},
	recent: () => {
		expect(DIRECTORY_SORT).toEqual(['-completeness', '-updatedAt', 'slug'])
	},
	far: () => {
		const lots = ['a', 'b', 'c', 'd', 'e', 'f'].map(slug =>
			artist(`loin-${slug}`, {
				ville: 'Nantes',
				departement: '44',
				center: PARIS,
				seDeplace: true,
				radiusKm: 150,
				farReach: true,
				unreachable: slug === 'a',
			})
		)
		const lyon: ResolvedPlace = { genre: 'point', point: { latitude: 45.764, longitude: 4.8357 }, label: 'Lyon' }
		const view = buildSearchView(lots, { search: '', city: 'Lyon' }, lyon)
		expect(view.far).toHaveLength(FAR_TRAVELLERS_MAX)
		expect(names(view.far)).not.toContain('loin-a')
	},
	blocks: () => {
		const directory = [
			artist('sans-contact', { unreachable: true, textes: texts('Mariage') }),
			artist('non-publiable', { indexable: false, textes: texts('Mariage') }),
			artist('bonne', { textes: texts('Mariage') }),
		]
		expect(profileBlockCards(directory, { search: 'mariage', limit: 6 }).map(card => card.slug)).toEqual(['bonne'])
	},
	preset: () => {
		const directory = Array.from({ length: 9 }, (_, i) => artist(`p${i + 1}`))
		const views = new Map(directory.map((profile, i) => [profile.carte.slug, MOST_VIEWED_MIN_VIEWS + i]))
		// Enough profiles with enough visits: the most visited first, six of them.
		const ranked = selectPreset(directory, orderMostViewed(views))
		expect(ranked.kind).toBe('most-viewed')
		expect(ranked.profiles.map(profile => profile.nom)).toEqual(['p9', 'p8', 'p7', 'p6', 'p5', 'p4'])
		expect(ranked.profiles).toHaveLength(PRESET_SIZE)
		// One visit short of the floor, or one profile short of the minimum: the order of the directory, said as such.
		const short = new Map([...views].slice(0, MOST_VIEWED_MIN_PROFILES - 1))
		expect(selectPreset(directory, orderMostViewed(short)).kind).toBe('best-ranked')
		expect(orderMostViewed(new Map([['p1', MOST_VIEWED_MIN_VIEWS - 1]]))).toEqual([])
		expect(selectPreset(directory, null).profiles.map(profile => profile.nom)).toEqual([
			'p1',
			'p2',
			'p3',
			'p4',
			'p5',
			'p6',
		])
	},
	pages: () => {
		const all = Array.from({ length: 45 }, (_, i) => i)
		const seen = [1, 2, 3].flatMap(page => paginate(all, page).elements)
		expect(seen).toEqual(all)
		expect(paginate(all, 1).elements).toHaveLength(20)
	},
}

describe('1012 : chaque règle annoncée est tenue par le code', () => {
	test('une vérification par règle, et pas une de plus', () => {
		expect(Object.keys(CHECKS).toSorted()).toEqual(RANKING_RULES.map(rule => rule.id).toSorted())
	})
	for (const rule of RANKING_RULES) test(`${rule.id}`, () => CHECKS[rule.id]())
})

describe('1012 : la page dit ce que dit la source, et rien d’autre', () => {
	const html = renderToStaticMarkup(<RankingExplainer />)
	const text = html
		.replace(/<[^>]+>/g, ' ')
		.replaceAll('&#x27;', '’')
		.replaceAll('&quot;', '"')
		.replace(/\s+/g, ' ')

	test('chaque règle, chaque titre de groupe et chaque exclusion est dans la page, dans l’ordre', () => {
		let last = -1
		for (const rule of RANKING_RULES) {
			const at = text.indexOf(rule.text.replace(/\s+/g, ' '))
			expect(at, rule.id).toBeGreaterThan(last)
			last = at
		}
		for (const group of RANKING_GROUPS) expect(text).toContain(group.title)
		for (const line of RANKING_EXCLUDED) expect(text).toContain(line)
	})

	test('issue 1004 : la page explique le badge, avec les mots de la source, à l’adresse que les profils pointent', () => {
		expect(html).toContain(`id="${BADGE_ANCHOR}"`)
		expect(text).toContain(BADGE_TITLE)
		for (const paragraph of BADGE_EXPLANATION) expect(text).toContain(paragraph)
		// What is checked is said, and what is not.
		expect(text).toContain('Il ne dit rien de la qualité de son travail')
	})

	test('les chiffres de la page sont ceux du code', () => {
		expect(text).toContain(`à moins de ${NEARBY_MAX_KM} km`)
		expect(text).toContain(`au plus ${FAR_TRAVELLERS_MAX} maquilleuses`)
		expect(text).toContain('20 par page')
	})
})

describe('1012 : rien de payant n’entre dans le classement', () => {
	test('le badge Pro ne change aucun ordre', () => {
		const make = (pro: boolean) => [
			artist('a', { carte: { ...artist('a').carte, superMaquilleuse: pro } }),
			artist('b'),
			artist('c', { carte: { ...artist('c').carte, superMaquilleuse: !pro } }),
		]
		expect(order(byPoint(make(true)))).toEqual(order(byPoint(make(false))))
		expect(order(noCity(make(true)))).toEqual(order(noCity(make(false))))
	})

	test('issue 1004 : le badge « Activité vérifiée » ne change aucun ordre, avec ou sans ville', () => {
		const make = (badge: boolean) => [
			artist('a', { carte: { ...artist('a').carte, ...(badge && { activityVerified: true as const }) } }),
			artist('b'),
			artist('c', { carte: { ...artist('c').carte, ...(!badge && { activityVerified: true as const }) } }),
		]
		expect(order(byPoint(make(true)))).toEqual(order(byPoint(make(false))))
		expect(order(noCity(make(true)))).toEqual(order(noCity(make(false))))
		expect(order(noCity(make(true), 'mariage'))).toEqual(order(noCity(make(false), 'mariage')))
	})

	test('issue 1004 : la page le dit en une phrase, et le code qui classe ne lit ni le badge ni le SIRET', () => {
		expect(RANKING_EXCLUDED).toContain(BADGE_NO_BONUS)
		expect(BADGE_NO_BONUS).toContain('aucun avantage')
		expect(BADGE_NO_BONUS).toContain('ni pénalisée')
	})

	test('le code qui classe ne lit aucune notion payante', () => {
		const files = [
			...readdirSync(join(import.meta.dir, '../../src/lib/search')).map(file => `src/lib/search/${file}`),
			'src/services/public/profile-block.ts',
		].filter(file => !file.endsWith('ranking.ts'))
		for (const file of files) {
			const source = readFileSync(join(import.meta.dir, '../..', file), 'utf8')
			expect(source, file).not.toMatch(
				/superMaquilleuse|superArtist|sponsor|premium|paid|subscription|stripe|advert|siret|activity|verified|verif/i
			)
		}
		expect(DIRECTORY_SORT.join(' ')).not.toMatch(/super|premium|paid|sponsor/i)
	})
})

describe('1012 : le tri de l’annuaire est celui que la page annonce', () => {
	test('la lecture de l’annuaire demande exactement DIRECTORY_SORT', async () => {
		let sort: unknown
		const payload = {
			find: async (options: { collection: string; sort?: unknown }) => {
				if (options.collection === 'profiles' && options.sort !== undefined) sort = options.sort
				return { docs: [], page: 1, totalDocs: 0, hasNextPage: false }
			},
		} as unknown as Payload
		await readDirectory(payload)
		expect(sort).toEqual([...DIRECTORY_SORT])
	})
})

describe('1012 : un lien sous chaque liste', () => {
	const link = `href="${RANKING_PATH}"`
	test('sous les résultats', () => {
		const view = byPoint([artist('une')])
		const html = renderToStaticMarkup(<SearchResults vue={view} recherche={{ search: '', city: 'Annecy', page: 1 }} />)
		expect(html).toContain(link)
		expect(html).toContain(RANKING_LINK_TEXT)
	})
	test('sous « Elles se déplacent loin »', () => {
		const far = artist('loin', { farReach: true })
		const html = renderToStaticMarkup(<NoResult titre="t" search="" city="Lyon" loin={[far.carte]} />)
		expect(html).toContain(link)
	})
	test('sous les maquilleuses d’une page de texte', () => {
		const html = renderToStaticMarkup(<ProfileBlock titre="Des maquilleuses" cartes={[artist('une').carte]} />)
		expect(html).toContain(link)
	})
})
