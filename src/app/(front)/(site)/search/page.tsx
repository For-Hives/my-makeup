import { SearchAnalytics } from '@/components/analytics/PageAnalytics'
import { Chip } from '@/components/art/Chip'
import { body, display } from '@/components/direct-edit/fonts'
import { PresetRow } from '@/components/search/PresetRow'
import { SearchBar } from '@/components/search/SearchBar'
import { ChipGroup } from '@/components/search/SearchRefine'
import { PAGE_TITLE, SearchResults } from '@/components/search/SearchResults'
import { NoMatchForFilters, NoResult, SearchFailed } from '@/components/search/SearchStates'
import { fingerprint } from '@/lib/analytics/duplicate'
import { resultBucket } from '@/lib/analytics/values'
import { departmentOfSearch } from '@/lib/search/count'
import { EVENT_CHOICES } from '@/lib/search/event-choices'
import { readFilters, readLayout } from '@/lib/search/filters'
import { readSearch, searchByCity, searchByWord, searchPageUrl } from '@/lib/search/input'
import { readPlace } from '@/lib/search/place'
import { resolvePlace } from '@/lib/search/place-point'
import { selectPreset } from '@/lib/search/preset'
import { readWithoutBlocking } from '@/lib/search/read'
import { buildSearchView } from '@/lib/search/view'
import { pageMetadata } from '@/lib/seo/metadata'
import { cachedDirectory, cachedDirectoryWithTexts, cachedMostViewed } from '@/services/public/cached'

/** The page is on the paper of the kit, in the preloaded pair of faces of the text pages (a Bodoni title above the fold: no shift). */
const MAIN = `${display.variable} ${body.variable} relative flex flex-1 flex-col bg-art-paper font-body`

// The address is the search: read at each request. The directory it ranks is read through the cache
// of Next, tagged `profils` (ticket 047); so is the order of the most viewed profiles of the preset.
export const dynamic = 'force-dynamic'

// Never indexed: no canonical address, a noindex tag here and a noindex header from the proxy.
export const metadata = pageMetadata({
	titre: 'Recherche de maquilleuse',
	description: 'Recherchez la maquilleuse professionnelle qui vous correspond en quelques clics sur My-Makeup.',
	repli: 'Recherchez la maquilleuse professionnelle qui vous correspond en quelques clics sur My-Makeup.',
	chemin: '/search',
	indexable: false,
})

/**
 * The search page: `/search?search=…&city=…&page=…`. The address is the only source of the search.
 *
 * - By city (ticket 098): the artists of the city or of the département typed come first and are the
 *   only ones the title counts; the others follow under their own headings. When the commune is known
 *   (ticket 295) they are ranked by distance, and a city where nobody is near gets the honest empty state.
 * - By a word, alone or with a city (ticket 099): the listed profiles that hold the words, best first
 *   (src/lib/search/relevance.ts); with a city, hers come first, as above.
 * - Filters and a sort (issue 1011): a ceiling on the starting price, and a sort inside each section, both
 *   read from the address and both optional (src/lib/search/filters.ts). A filtered view is the same search for
 *   the measure.
 * - Pages of 20, every profile once (ticket 100), and an error state with « Réessayer » when the
 *   directory cannot be read in time. The brake by address is the proxy's (src/proxy.ts).
 *
 * - Without a word or a city, the page shows its preset (src/lib/search/preset.ts): « Les plus consultées en France »
 *   (the views of the last 30 days, the order only) or, when they do not say enough, « Les mieux classées » (the
 *   documented order). The layout of the results (`layout=list|grid`) is read from the address too.
 *
 * A profile that is hidden, unavailable or entirely empty is not in the directory it ranks
 * (src/lib/profile/visibility.ts). The text typed is never logged and never measured.
 */
export default async function SearchPage({ searchParams }: PageProps<'/search'>) {
	const parameters = await searchParams
	const query = readSearch(parameters)
	const filters = readFilters(parameters)
	const { search, city } = query

	const layout = readLayout(parameters)

	if (!searchByCity(query) && !searchByWord(query)) {
		// The preset is a bonus: a directory or a counter that cannot be read leaves the page as it was, never an error.
		const [directory, viewed] = await Promise.all([
			readWithoutBlocking(cachedDirectory),
			readWithoutBlocking(cachedMostViewed, 3000, 'des visites'),
		])
		const preset = directory.reussie ? selectPreset(directory.valeur, viewed.reussie ? viewed.valeur : null) : null
		return (
			<main className={MAIN}>
				<SearchBar
					search={search}
					city={city}
					heading={
						<div className="mb-8 max-w-3xl">
							<h1 className={`${PAGE_TITLE} mb-4`}>Rechercher une maquilleuse</h1>
							<p className="text-lg text-mute">
								Indiquez une prestation, une ville, ou les deux, pour voir les maquilleuses
							</p>
						</div>
					}
				/>
				<div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] gap-14 px-4 py-12 md:px-16 md:py-16">
					<ChipGroup label="Une idée pour commencer">
						{EVENT_CHOICES.filter(choice => choice.search !== '').map(choice => (
							<Chip key={choice.label} href={searchPageUrl({ search: choice.search })} prefetch={false}>
								{choice.label}
							</Chip>
						))}
					</ChipGroup>
					{preset && <PresetRow preset={preset} />}
				</div>
			</main>
		)
	}

	// The place typed is resolved beside the read of the directory: the two waits do not add up (ticket 295).
	const [reading, place] = await Promise.all([
		readWithoutBlocking(searchByWord(query) ? cachedDirectoryWithTexts : cachedDirectory),
		city === '' ? ({ genre: 'unknown' } as const) : resolvePlace(city),
	])
	if (!reading.reussie)
		return (
			<main className={MAIN}>
				<SearchBar search={search} city={city} />
				<SearchFailed recherche={{ ...query, ...filters }} />
			</main>
		)

	const directory = reading.valeur
	const view = buildSearchView(directory, query, place, filters)

	return (
		<main className={MAIN}>
			<SearchBar search={search} city={city} />
			{/* Two facts and a hash: never the words (ticket 145). Page 1 and page 2 are the same search. */}
			<SearchAnalytics
				aUneVille={city !== ''}
				resultats={resultBucket(view.baselineTotal)}
				empreinte={fingerprint(`${search}|${city}`)}
				departement={departmentOfSearch(city, place.genre === 'point' ? place.department : null)}
			/>
			{view.filteredOut ? (
				<NoMatchForFilters
					titre={view.title}
					recherche={query}
					filtres={filters}
					specialites={view.specialties}
					tranches={view.bands}
					layout={layout}
					baselineTotal={view.baselineTotal}
				/>
			) : view.empty ? (
				<NoResult
					titre={view.title}
					search={search}
					city={city}
					departements={view.departments}
					codesPostaux={readPlace(city).postalCodes}
					foreignCity={view.foreignCity}
					foreignCountry={view.foreignCountry}
					loin={view.far.map(({ carte }) => carte)}
				/>
			) : (
				<SearchResults vue={view} recherche={query} filtres={filters} layout={layout} />
			)}
		</main>
	)
}
