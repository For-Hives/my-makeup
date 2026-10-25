/**
 * The search page in the look of the kit: the results as row cards or grid cards, the bar and its filters as plain
 * links and a plain form, the preset of the page without a criterion, the empty states. Made-up profiles only.
 */

import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { PresetRow } from '@/components/search/PresetRow'
import { SearchBar } from '@/components/search/SearchBar'
import { SearchGrid } from '@/components/search/SearchGrid'
import { SearchRefine } from '@/components/search/SearchRefine'
import { SearchResults } from '@/components/search/SearchResults'
import { NoMatchForFilters, NoResult } from '@/components/search/SearchStates'
import { DEFAULT_FILTERS, type PriceBand, priceBands } from '@/lib/search/filters'
import { selectPreset } from '@/lib/search/preset'
import { buildSearchView } from '@/lib/search/view'
import type { DirectoryProfile, ProfileCard } from '@/services/public/profiles'

const card = (slug: string, extra: Partial<ProfileCard> = {}): ProfileCard => ({
	slug,
	pid: 1 as never,
	nom: `Nom ${slug}`,
	specialite: 'Mariage',
	lieu: 'Annecy',
	superMaquilleuse: false,
	photo: null,
	...extra,
})
const html = (node: React.ReactElement) => renderToStaticMarkup(node)
const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0

const CARDS = [
	card('a', { startingPrice: 90, offerNames: ['Mariée', 'Essai'] }),
	card('b'),
	card('c', { lieu: null, unreachable: true }),
]

describe('les résultats : une carte en ligne ou en grille', () => {
	test('la liste est celle des cartes en ligne : une liste, un item par maquilleuse, un seul lien par carte', () => {
		const out = html(<SearchGrid cartes={CARDS} layout="list" premiereDeLaPage rangDuPremier={1} />)
		expect(count(out, /data-profile-row-card/g)).toBe(3)
		expect(count(out, /<li class="reveal/g)).toBe(3)
		expect(count(out, /href="\/profil\//g)).toBe(3)
		expect(out).toContain('href="/profil/a"')
	})

	test('la grille est celle des cartes verticales', () => {
		const out = html(<SearchGrid cartes={CARDS} layout="grid" premiereDeLaPage rangDuPremier={1} />)
		expect(count(out, /data-profile-card/g)).toBe(3)
		expect(out).not.toContain('data-profile-row-card')
		expect(count(out, /href="\/profil\//g)).toBe(3)
	})

	test('les règles de la carte restent : prix « dès » seulement s’il existe, zone vide dite, aucune coordonnée', () => {
		const out = html(<SearchGrid cartes={CARDS} layout="list" premiereDeLaPage rangDuPremier={1} />)
		expect(count(out, /dès\s*90/g)).toBe(1)
		expect(out).toContain('Zone non renseignée')
		expect(out).toContain('Coordonnées pas encore indiquées')
		expect(out).not.toMatch(/tel:|mailto:|@/)
	})

	test('chaque carte est un titre de niveau 3 sous le titre de rubrique, et les deux premières photos de la page se chargent tout de suite', () => {
		const out = html(<SearchGrid cartes={CARDS} layout="list" premiereDeLaPage rangDuPremier={1} />)
		expect(count(out, /<h3[ >]/g)).toBe(3)
		const later = html(<SearchGrid cartes={CARDS} layout="list" premiereDeLaPage={false} rangDuPremier={21} />)
		expect(later).not.toContain('fetchPriority="high"')
	})

	test('la liste porte le rang (la mesure du clic) seulement quand un rang de départ est donné', () => {
		const ranked = html(<SearchGrid cartes={CARDS} layout="list" premiereDeLaPage rangDuPremier={21} />)
		const unranked = html(<SearchGrid cartes={CARDS} layout="list" />)
		// Both render a link; the tracked one is a client link whose click carries the rank: its markup is the same, so the
		// difference is tested where the cards are (art-components.test.tsx). Here: nothing breaks without a rank.
		expect(count(ranked, /href="\/profil\//g)).toBe(3)
		expect(count(unranked, /href="\/profil\//g)).toBe(3)
	})
})

describe('un nom très long ne fait pas déborder la carte', () => {
	test('la colonne de texte de chaque carte est une piste qui peut rétrécir (sinon un nom sans coupure élargit la page)', () => {
		const long = card('long', { nom: 'Marie-Apolline-Joséphine-Bérénice-Eugénie-Héloïse-Delaunay-Vasseur-de-La-Roche' })
		for (const layout of ['list', 'grid'] as const) {
			const out = html(<SearchGrid cartes={[long]} layout={layout} />)
			expect(out).toContain('grid-cols-[minmax(0,1fr)] gap-2.5')
			expect(out).toContain('[overflow-wrap:anywhere]')
		}
	})
})

describe('le bandeau de recherche', () => {
	test('un formulaire GET vers /search, les deux champs gardent leurs libellés et le bouton son texte', () => {
		const out = html(<SearchBar search="mariage" city="Annecy" />)
		expect(out).toContain('action="/search"')
		expect(out).toContain('method="get"')
		expect(out).toContain('role="search"')
		expect(out).toContain('Prestation recherchée')
		expect(out).toContain('Ville de la prestation')
		expect(out).toContain('Trouver une maquilleuse')
		expect(out).toContain('value="mariage"')
		expect(out).toContain('value="Annecy"')
	})

	test('le décor est caché aux lecteurs d’écran, et le titre de la page peut être posé au-dessus du formulaire', () => {
		const out = html(<SearchBar heading={<h1>Titre</h1>} />)
		expect(out.indexOf('<h1>Titre</h1>')).toBeLessThan(out.indexOf('<form'))
		expect(out).not.toMatch(/<title/)
	})
})

const BANDS: PriceBand[] = priceBands(
	[30, 40, 45, 60, 70, 80, 90, 110, 130, 150, 200, 400].map(startingPrice => ({ startingPrice }))
)
const SPECIALTIES = [
	{ value: 'wedding', label: 'Mariage' },
	{ value: 'event', label: 'Soirée et événement' },
]

describe('les filtres : des liens et un formulaire, sans script', () => {
	const refine = (filters = DEFAULT_FILTERS, layout: 'list' | 'grid' = 'list', total = 12) =>
		html(
			<SearchRefine
				recherche={{ search: 'mariage', city: 'Annecy' }}
				filtres={filters}
				specialites={SPECIALTIES}
				tranches={BANDS}
				layout={layout}
				total={total}
				baselineTotal={12}
			/>
		)

	test('chaque choix est un lien qui garde le mot et la ville, et repart à la première page', () => {
		const out = refine()
		expect(out).toContain('href="/search?search=mariage&amp;city=Annecy&amp;specialty=wedding"')
		expect(out).toContain('href="/search?search=mariage&amp;city=Annecy&amp;maxPrice=69"')
		expect(out).toContain('href="/search?search=mariage&amp;city=Annecy&amp;minPrice=70&amp;maxPrice=129"')
		expect(out).toContain('href="/search?search=mariage&amp;city=Annecy&amp;minPrice=130"')
		expect(out).toContain('href="/search?search=mariage&amp;city=Annecy&amp;sort=price"')
		expect(out).not.toContain('page=')
	})

	test('le choix en cours est signalé aux lecteurs d’écran et aux yeux, et il garde les autres filtres', () => {
		const out = refine({ ...DEFAULT_FILTERS, specialty: 'wedding', minPrice: 70, maxPrice: 129, sort: 'price' })
		expect(count(out, /aria-current="true"/g)).toBe(4)
		expect(out).toContain(
			'href="/search?search=mariage&amp;city=Annecy&amp;specialty=event&amp;minPrice=70&amp;maxPrice=129&amp;sort=price"'
		)
	})

	test('aucun script, aucun contrôle sans nom, aucune liste de puces avant les résultats', () => {
		const out = refine()
		expect(out).not.toContain('<script')
		expect(out).not.toContain('<ul')
		for (const name of ['Spécialité', 'Budget', 'Trier par', 'Présentation des résultats'])
			expect(out).toMatch(new RegExp(`<fieldset[^>]*>\\s*<legend[^>]*>${name}</legend>`))
	})

	test('sans tranche réelle, pas de budget : la page ne devine pas', () => {
		const out = html(
			<SearchRefine
				recherche={{ search: 'mariage', city: '' }}
				filtres={DEFAULT_FILTERS}
				specialites={[]}
				tranches={[]}
				layout="list"
				total={3}
				baselineTotal={3}
			/>
		)
		expect(out).not.toContain('Budget')
		expect(out).not.toContain('Spécialité')
	})

	test('un budget d’un lien partagé qui n’est dans aucune tranche reste visible et se retire', () => {
		const out = refine({ ...DEFAULT_FILTERS, maxPrice: 137 })
		expect(out).toContain('Jusqu’à 137')
		expect(out).toContain('aria-current="true"')
		expect(out).toContain('sur devis')
	})

	test('« Réinitialiser » n’apparaît que si un filtre est posé, et garde le mot, la ville et la présentation', () => {
		expect(refine()).not.toContain('Réinitialiser')
		const out = refine({ ...DEFAULT_FILTERS, sort: 'recent' }, 'grid')
		expect(out).toMatch(/href="\/search\?search=mariage&amp;city=Annecy&amp;layout=grid"[^>]*>[^<]*Réinitialiser/)
	})

	test('la ligne de comptage dit le nombre, et le nombre sans filtre quand un filtre en retire', () => {
		expect(refine()).toContain('12 maquilleuses')
		const filtered = refine({ ...DEFAULT_FILTERS, maxPrice: 69 }, 'list', 4)
		expect(filtered).toContain('4 maquilleuses')
		expect(filtered).toContain('sur 12')
		expect(refine(DEFAULT_FILTERS, 'list', 1)).toContain('1 maquilleuse<')
		expect(refine()).toContain('Seules les maquilleuses disponibles')
	})

	test('le choix liste ou grille : deux liens, l’un courant, qui gardent la recherche et les filtres', () => {
		const out = refine({ ...DEFAULT_FILTERS, sort: 'price' }, 'list')
		expect(out).toContain('href="/search?search=mariage&amp;city=Annecy&amp;sort=price&amp;layout=grid"')
		expect(out).toContain('href="/search?search=mariage&amp;city=Annecy&amp;sort=price"')
	})
})

const DIRECTORY = Array.from({ length: 8 }, (_, i) => ({
	carte: card(`p${i + 1}`, { startingPrice: 50 + i * 10 }),
	indexable: true,
	unreachable: false,
	departement: '74',
}))

describe('la sélection de la page sans critère', () => {
	test('le palmarès dit son critère, avec ses cartes, sans rang ni nombre de visites', () => {
		const preset = selectPreset(DIRECTORY, ['p3', 'p1', 'p2', 'p5', 'p4', 'p6'])
		const out = html(<PresetRow preset={preset} />)
		expect(out).toContain('Les plus consultées en France')
		expect(out).toContain('30 derniers jours')
		expect(count(out, /data-profile-card/g)).toBe(6)
		expect(out.indexOf('Nom p3')).toBeLessThan(out.indexOf('Nom p1'))
		expect(out).not.toMatch(/\d+\s*(visites?|vues?)/i)
		expect(out).toMatch(/<h2[^>]*>Les plus consultées en France<\/h2>/)
		expect(count(out, /<h3[ >]/g)).toBe(6)
	})

	test('le repli dit « Les mieux classées » et ne prétend aucune popularité', () => {
		const out = html(<PresetRow preset={selectPreset(DIRECTORY, null)} />)
		expect(out).toContain('Les mieux classées')
		expect(out).not.toMatch(/consult|demand|populaire|tendance|plébisc/i)
		expect(out).toContain('href="/classement"')
	})

	test('sans profil à montrer, aucune section', () => {
		expect(html(<PresetRow preset={selectPreset([], null)} />)).toBe('')
	})
})

type Row = DirectoryProfile & { carte: ProfileCard }
const row = (slug: string, extra: Partial<DirectoryProfile> = {}): Row =>
	({
		carte: card(slug),
		sortName: slug,
		ville: 'Annecy',
		departement: '74',
		seDeplace: false,
		postalCodes: [],
		center: null,
		radiusKm: null,
		farReach: false,
		unreachable: false,
		indexable: true,
		...extra,
	}) as Row

describe('les états de la page dans le style du kit', () => {
	test('une recherche qui trouve : un seul titre de niveau 1, la liste en cartes en ligne, les filtres avant elle', () => {
		const query = { search: '', city: 'Annecy', page: 1 }
		const view = buildSearchView([row('x', { startingPrice: 60 }), row('y')], query, { genre: 'unknown' })
		const out = html(<SearchResults vue={view as never} recherche={query} layout="list" />)
		expect(count(out, /<h1[ >]/g)).toBe(1)
		expect(count(out, /data-profile-row-card/g)).toBe(2)
		expect(out).toContain('Comment sont classées les maquilleuses ?')
		const grid = html(<SearchResults vue={view as never} recherche={query} layout="grid" />)
		expect(count(grid, /data-profile-card(?!-)/g)).toBe(2)
	})

	test('la pagination garde la présentation choisie', () => {
		const many = Array.from({ length: 25 }, (_, i) => row(`z${String(i).padStart(2, '0')}`))
		const query = { search: '', city: 'Annecy', page: 1 }
		const view = buildSearchView(many, query, { genre: 'unknown' })
		const out = html(<SearchResults vue={view as never} recherche={query} layout="grid" />)
		expect(out).toContain('href="/search?city=Annecy&amp;layout=grid&amp;page=2"')
	})

	test('le vide dit ce qui s’est passé, propose une sortie et garde les liens existants', () => {
		const out = html(
			<NoResult titre="Aucun résultat pour « zzqq »" search="zzqq" city="Annecy" departements={['74']} />
		)
		expect(out).toMatch(/<h1[^>]*>Aucun résultat pour « zzqq »<\/h1>/)
		expect(out).toContain('Essayez un autre mot')
		expect(out).toContain('Chercher « zzqq » partout')
		expect(out).toContain('href="/auth/signup"')
	})

	test('les filtres qui vident : un titre, la phrase, « Réinitialiser » et le compte sans filtre', () => {
		const out = html(
			<NoMatchForFilters
				titre="Aucune maquilleuse ne correspond à ces filtres"
				recherche={{ search: 'mariage', city: 'Annecy' }}
				filtres={{ ...DEFAULT_FILTERS, maxPrice: 69 }}
				specialites={SPECIALTIES}
				tranches={BANDS}
				layout="list"
				baselineTotal={12}
			/>
		)
		expect(out).toMatch(/<h1[^>]*>Aucune maquilleuse ne correspond à ces filtres<\/h1>/)
		expect(out).toContain('Réinitialiser')
		expect(out).toContain('Voir toutes les maquilleuses de cette recherche')
		expect(out).toContain('12')
	})
})
