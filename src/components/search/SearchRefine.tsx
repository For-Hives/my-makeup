import { PRICE_CEILINGS, type SearchFilters, SORT_LABELS, SORTS } from '@/lib/search/filters'
import { type Search, searchPageUrl } from '@/lib/search/input'

const CONTROL =
	'min-h-[44px] w-full rounded-lg border-2 border-indigo-900 bg-white px-3 py-2 text-gray-900 text-sm md:w-auto'

/**
 * The filters and the sort of the results (issue 1011): a plain form of the search page that keeps the
 * word and the city, and starts again at the first page. It carries no submission mark of the measure: a
 * filtered view is the same search, not a new one. It needs no script.
 */
export function SearchRefine({
	recherche: query,
	filtres: filters,
}: {
	recherche: Pick<Search, 'search' | 'city'>
	filtres: SearchFilters
}) {
	return (
		<form action="/search" method="get" aria-label="Affiner les résultats" className="mb-8 flex flex-col gap-3">
			{query.search && <input type="hidden" name="search" value={query.search} />}
			{query.city && <input type="hidden" name="city" value={query.city} />}
			<div className="flex flex-col gap-3 md:flex-row md:items-end">
				<div className="flex flex-col gap-1">
					<label htmlFor="recherche-prix" className="font-semibold text-gray-800 text-sm">
						Prix de départ
					</label>
					<select id="recherche-prix" name="maxPrice" defaultValue={filters.maxPrice ?? ''} className={CONTROL}>
						<option value="">Tous les prix</option>
						{PRICE_CEILINGS.map(ceiling => (
							<option key={ceiling} value={ceiling}>
								Jusqu’à {ceiling} €
							</option>
						))}
					</select>
				</div>
				<div className="flex flex-col gap-1">
					<label htmlFor="recherche-tri" className="font-semibold text-gray-800 text-sm">
						Trier par
					</label>
					<select id="recherche-tri" name="sort" defaultValue={filters.sort} className={CONTROL}>
						{SORTS.map(sort => (
							<option key={sort} value={sort}>
								{SORT_LABELS[sort]}
							</option>
						))}
					</select>
				</div>
				<button type="submit" className="btn-primary min-h-[44px] md:w-auto">
					Appliquer
				</button>
				{(filters.maxPrice !== null || filters.sort !== 'relevance') && (
					<a
						href={searchPageUrl(query)}
						className="inline-flex min-h-[44px] items-center font-semibold text-indigo-900 underline"
					>
						Retirer les filtres
					</a>
				)}
			</div>
			{filters.maxPrice !== null && (
				<p className="text-gray-700 text-sm">
					Les maquilleuses qui n’ont pas indiqué de tarif chiffré (« sur devis ») ne sont pas affichées avec un prix
					maximum.
				</p>
			)}
		</form>
	)
}
