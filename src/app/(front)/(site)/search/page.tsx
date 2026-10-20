import Image from 'next/image'
import { MesureDeRecherche } from '@/components/analytics/MesureDePage'
import { BlocDeRecherche } from '@/components/blocs/BlocDeRecherche'
import { NoResult, SearchFailed } from '@/components/search/SearchStates'
import { ResultList } from '@/components/search/ResultList'
import { ResultPages } from '@/components/search/ResultPages'
import { empreinte } from '@/lib/analytics/doublon'
import { trancheDeResultats } from '@/lib/analytics/valeurs'
import { readWithoutBlocking } from '@/lib/search/read'
import { sectionsByPlace } from '@/lib/search/place'
import { paginate, sectionsOfPage } from '@/lib/search/pagination'
import { find } from '@/lib/search/results'
import { readSearch, searchByWord, searchByCity, resultsTitle } from '@/lib/search/input'
import { metadonnees } from '@/lib/seo/metadonnees'
import { cachedDirectoryWithTexts, cachedDirectory } from '@/services/public/cached'

// The address is the search: read at each request. The directory it ranks is read through the cache
// of Next, tagged `profils` (ticket 047).
export const dynamic = 'force-dynamic'

// Never indexed: no canonical address, a noindex tag here and a noindex header from the proxy.
export const metadata = metadonnees({
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
 *   only ones the title counts; the others follow under their own headings.
 * - By a word, alone or with a city (ticket 099): the listed profiles that hold the words, best first
 *   (src/lib/search/relevance.ts); with a city, hers come first, as above.
 * - Pages of 20, every profile once (ticket 100), and an error state with « Réessayer » when the
 *   directory cannot be read in time. The brake by address is the proxy's (src/proxy.ts).
 *
 * A profile that is hidden, unavailable or entirely empty is not in the directory it ranks
 * (src/lib/profile/visibility.ts). The text typed is never logged and never measured.
 */
export default async function SearchPage({ searchParams }: PageProps<'/search'>) {
	const query = readSearch(await searchParams)
	const { search, city } = query

	if (!searchByCity(query) && !searchByWord(query)) {
		return (
			<main className="relative flex flex-1 flex-col">
				<BlocDeRecherche search={search} city={city} surLaPageDeRecherche />
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

	const reading = await readWithoutBlocking(searchByWord(query) ? cachedDirectoryWithTexts : cachedDirectory)
	if (!reading.reussie)
		return (
			<main className="relative flex flex-1 flex-col">
				<BlocDeRecherche search={search} city={city} surLaPageDeRecherche />
				<SearchFailed recherche={query} />
			</main>
		)

	const directory = reading.valeur
	const { locaux: localProfiles, parLieu: byPlace, sections } = find(directory, query)
	const all = [...localProfiles, ...sections.flatMap(section => section.profils)]
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

	return (
		<main className="relative flex flex-1 flex-col">
			<BlocDeRecherche search={search} city={city} surLaPageDeRecherche />
			{/* Two facts and a hash: never the words (ticket 145). Page 1 and page 2 are the same search. */}
			<MesureDeRecherche
				aUneVille={city !== ''}
				resultats={trancheDeResultats(all.length)}
				empreinte={empreinte(`${search}|${city}`)}
			/>
			{all.length === 0 ? (
				<NoResult
					titre={resultsTitle(query, 0)}
					search={search}
					city={city}
					departements={city ? sectionsByPlace(directory, city).departements : []}
				/>
			) : (
				<div className="w-full px-4 pb-16 md:px-16">
					<h1 className="mb-8 font-bold text-2xl text-gray-800">
						{resultsTitle(query, byPlace ? localProfiles.length : all.length)}
					</h1>
					{byPlace && localProfiles.length === 0 && (
						<p className="-mt-4 mb-8 text-gray-700">
							Aucune maquilleuse n’indique « {city} » (ville ou département) dans son profil.
						</p>
					)}
					{localsOfPage.length > 0 && (
						<section aria-labelledby="recherche-titre-locaux">
							<h2 id="recherche-titre-locaux" className="sr-only">
								{byPlace ? `Maquilleuses de « ${city} »` : 'Résultats'}
							</h2>
							<ResultList
								cartes={localsOfPage.map(({ carte }) => carte)}
								premiereDeLaPage
								rangDuPremier={page.premier}
							/>
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
					<ResultPages recherche={query} page={page.page} pages={page.pages} />
				</div>
			)}
		</main>
	)
}
