import { ResultList } from '@/components/search/ResultList'
import { ResultPages } from '@/components/search/ResultPages'
import { SearchRefine } from '@/components/search/SearchRefine'
import { DEFAULT_FILTERS, type SearchFilters } from '@/lib/search/filters'
import type { Search } from '@/lib/search/input'
import { paginate, sectionsOfPage } from '@/lib/search/pagination'
import { municipalitiesOfPostalCodes, municipalitiesPhrase } from '@/lib/search/place'
import type { SearchView } from '@/lib/search/view'
import type { DirectoryProfile } from '@/services/public/profiles'

/**
 * The results of a search that found someone (tickets 098, 100, 294 and 295): the title, the profiles of
 * the place typed, then the sections under their own headings, one page of 20 at a time. When the search is
 * ranked by distance the first heading is « À <place> » and is shown; otherwise it stays for screen readers.
 */
export function SearchResults({
	vue: view,
	recherche: query,
	filtres: filters = DEFAULT_FILTERS,
}: {
	vue: SearchView<DirectoryProfile>
	recherche: Pick<Search, 'search' | 'city' | 'page'>
	filtres?: SearchFilters
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
		<div className="w-full px-4 pb-16 md:px-16">
			<h1 className="mb-8 font-bold text-2xl text-gray-800">{view.title}</h1>
			<SearchRefine recherche={query} filtres={filters} specialites={view.specialties} />
			{municipalities && <p className="-mt-4 mb-8 text-gray-700">{municipalities}</p>}
			{!ranked && byPlace && localProfiles.length === 0 && (
				<p className="-mt-4 mb-8 text-gray-700">
					Aucune maquilleuse n’indique « {city} » (ville ou département) dans son profil.
				</p>
			)}
			{localsOfPage.length > 0 && (
				<section aria-labelledby="recherche-titre-locaux">
					<h2 id="recherche-titre-locaux" className={localHeading ? 'mb-8 font-bold text-gray-800 text-xl' : 'sr-only'}>
						{localHeading ?? (byPlace ? `Maquilleuses de « ${city} »` : 'Résultats')}
					</h2>
					<ResultList cartes={localsOfPage.map(({ carte }) => carte)} premiereDeLaPage rangDuPremier={page.premier} />
				</section>
			)}
			{groups.map(({ section, profils }, rang) => (
				<section key={section.cle} aria-labelledby={`recherche-titre-${section.cle}`}>
					<h2
						id={`recherche-titre-${section.cle}`}
						className={`mb-8 font-bold text-gray-800 text-xl ${rang > 0 || localsOfPage.length > 0 ? 'mt-12' : ''}`}
					>
						{section.titre}
					</h2>
					<ResultList
						cartes={profils.map(({ carte }) => carte)}
						rangDuPremier={startRanks[rang] ?? page.premier}
						premiereDeLaPage={rang === 0 && localsOfPage.length === 0}
					/>
				</section>
			))}
			<ResultPages recherche={{ ...query, ...filters }} page={page.page} pages={page.pages} />
		</div>
	)
}
