import Image from 'next/image'
import { SearchAnalytics } from '@/components/analytics/PageAnalytics'
import { SearchBlock } from '@/components/blocks/SearchBlock'
import { SearchResults } from '@/components/search/SearchResults'
import { NoMatchForFilters, NoResult, SearchFailed } from '@/components/search/SearchStates'
import { fingerprint } from '@/lib/analytics/duplicate'
import { resultBucket } from '@/lib/analytics/values'
import { departmentOfSearch } from '@/lib/search/count'
import { readFilters } from '@/lib/search/filters'
import { readSearch, searchByCity, searchByWord } from '@/lib/search/input'
import { readPlace } from '@/lib/search/place'
import { resolvePlace } from '@/lib/search/place-point'
import { readWithoutBlocking } from '@/lib/search/read'
import { buildSearchView } from '@/lib/search/view'
import { pageMetadata } from '@/lib/seo/metadata'
import { cachedDirectory, cachedDirectoryWithTexts } from '@/services/public/cached'

// The address is the search: read at each request. The directory it ranks is read through the cache
// of Next, tagged `profils` (ticket 047).
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
 * A profile that is hidden, unavailable or entirely empty is not in the directory it ranks
 * (src/lib/profile/visibility.ts). The text typed is never logged and never measured.
 */
export default async function SearchPage({ searchParams }: PageProps<'/search'>) {
	const parameters = await searchParams
	const query = readSearch(parameters)
	const filters = readFilters(parameters)
	const { search, city } = query

	if (!searchByCity(query) && !searchByWord(query)) {
		return (
			<main className="relative flex flex-1 flex-col">
				<SearchBlock search={search} city={city} surLaPageDeRecherche />
				<div className="flex w-full flex-col items-center justify-center gap-4 px-4 py-8 md:py-16 2xl:py-32">
					<h1 className="font-bold text-2xl text-gray-800">Rechercher une maquilleuse</h1>
					<div className="flex flex-col items-center justify-center gap-8">
						<Image src="/assets/vectorials-used/catSearch.svg" alt="" width={200} height={200} />
						<p className="px-8 text-center text-gray-700 text-lg md:text-xl">
							Indiquez une prestation, une ville, ou les deux, pour voir les maquilleuses
						</p>
					</div>
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
			<main className="relative flex flex-1 flex-col">
				<SearchBlock search={search} city={city} surLaPageDeRecherche />
				<SearchFailed recherche={{ ...query, ...filters }} />
			</main>
		)

	const directory = reading.valeur
	const view = buildSearchView(directory, query, place, filters)

	return (
		<main className="relative flex flex-1 flex-col">
			<SearchBlock search={search} city={city} surLaPageDeRecherche />
			{/* Two facts and a hash: never the words (ticket 145). Page 1 and page 2 are the same search. */}
			<SearchAnalytics
				aUneVille={city !== ''}
				resultats={resultBucket(view.baselineTotal)}
				empreinte={fingerprint(`${search}|${city}`)}
				departement={departmentOfSearch(city, place.genre === 'point' ? place.department : null)}
			/>
			{view.filteredOut ? (
				<NoMatchForFilters titre={view.title} recherche={query} filtres={filters} specialites={view.specialties} />
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
				<SearchResults vue={view} recherche={query} filtres={filters} />
			)}
		</main>
	)
}
