import { RankingLink } from '@/components/ranking/RankingLink'
import { ResultPages } from '@/components/search/ResultPages'
import { SearchGrid } from '@/components/search/SearchGrid'
import { SearchRefine } from '@/components/search/SearchRefine'
import { DEFAULT_FILTERS, type Layout, type SearchFilters } from '@/lib/search/filters'
import type { Search } from '@/lib/search/input'
import { paginate, sectionsOfPage } from '@/lib/search/pagination'
import { municipalitiesOfPostalCodes, municipalitiesPhrase } from '@/lib/search/place'
import type { SearchView } from '@/lib/search/view'
import type { DirectoryProfile } from '@/services/public/profiles'

/** The title of the page: Bodoni, one line of the kit, entering from its mask. */
export const PAGE_TITLE =
	'enter-mask mb-8 text-balance font-display font-medium text-4xl text-ink leading-[1.05] md:text-5xl'
const SECTION_TITLE = 'mb-6 font-display font-medium text-2xl text-ink md:text-3xl'

/**
 * The results of a search that found someone (tickets 098, 100, 294 and 295): the title, the filters and the count, the
 * profiles of the place typed, then the sections under their own headings, one page of 20 at a time, as rows or as a
 * grid of cards. When the search is ranked by distance the first heading is « À <place> » and is shown; otherwise it
 * stays for screen readers.
 */
export function SearchResults({
	vue: view,
	recherche: query,
	filtres: filters = DEFAULT_FILTERS,
	layout = 'list',
}: {
	vue: SearchView<DirectoryProfile>
	recherche: Pick<Search, 'search' | 'city' | 'page'>
	filtres?: SearchFilters
	layout?: Layout
}) {
	const { places, ranked } = view
	const { locaux: localProfiles, parLieu: byPlace, sections } = places
	const { city } = query
	const all = [...localProfiles, ...sections.flatMap(section => section.profils)]
	// Ticket 263: the communes a postal code found, named from the profiles listed.
	const municipalities = municipalitiesPhrase(municipalitiesOfPostalCodes(localProfiles, city))
	const page = paginate(all, query.page)
	const [localsOfPage = [], ...sectionsOfThisPage] = sectionsOfPage(page, [
		localProfiles.length,
		...sections.map(section => section.profils.length),
	])
	// The sections that have something on this page, in order.
	const groups = sections
		.map((section, rang) => ({ section, profils: sectionsOfThisPage[rang] ?? [] }))
		.filter(({ profils }) => profils.length > 0)
	// The rank of a card is its place in the whole list, over all the pages: the sections follow one another.
	const startRanks = groups.reduce<number[]>(
		(departs, { profils }, i) => [...departs, (departs[i] ?? 0) + profils.length],
		[page.premier + localsOfPage.length]
	)
	const localHeading = ranked && places.localTitle ? places.localTitle : null

	return (
		<div className="page-frame pt-10 pb-20 md:pt-14">
			<h1 className={PAGE_TITLE}>{view.title}</h1>
			<SearchRefine
				recherche={query}
				filtres={filters}
				specialites={view.specialties}
				tranches={view.bands}
				layout={layout}
				total={view.total}
				baselineTotal={view.baselineTotal}
			/>
			{municipalities && <p className="-mt-4 mb-8 text-mute">{municipalities}</p>}
			{!ranked && byPlace && localProfiles.length === 0 && (
				<p className="-mt-4 mb-8 text-mute">
					Aucune maquilleuse n’indique « {city} » (ville ou département) dans son profil.
				</p>
			)}
			{localsOfPage.length > 0 && (
				<section aria-labelledby="recherche-titre-locaux">
					<h2 id="recherche-titre-locaux" className={localHeading ? SECTION_TITLE : 'sr-only'}>
						{localHeading ?? (byPlace ? `Maquilleuses de « ${city} »` : 'Résultats')}
					</h2>
					<SearchGrid
						cartes={localsOfPage.map(({ carte }) => carte)}
						layout={layout}
						premiereDeLaPage
						rangDuPremier={page.premier}
					/>
				</section>
			)}
			{groups.map(({ section, profils }, rang) => (
				<section key={section.cle} aria-labelledby={`recherche-titre-${section.cle}`}>
					<h2
						id={`recherche-titre-${section.cle}`}
						className={`${SECTION_TITLE} ${rang > 0 || localsOfPage.length > 0 ? 'mt-14' : ''}`}
					>
						{section.titre}
					</h2>
					<SearchGrid
						cartes={profils.map(({ carte }) => carte)}
						layout={layout}
						rangDuPremier={startRanks[rang] ?? page.premier}
						premiereDeLaPage={rang === 0 && localsOfPage.length === 0}
					/>
				</section>
			))}
			<RankingLink />
			<ResultPages recherche={{ ...query, ...filters, layout }} page={page.page} pages={page.pages} />
		</div>
	)
}
