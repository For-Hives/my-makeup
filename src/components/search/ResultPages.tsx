import { type Search, searchPageUrl } from '@/lib/search/input'

/**
 * The links between the pages of the results (ticket 100): « Page précédente », « Page 2 sur 3 »,
 * « Page suivante », each keeping the word and the city of the address. Plain links, not `next/link`: a
 * link of Next would prefetch the next page, and every prefetch is a search the brake counts.
 */
export function ResultPages({
	recherche,
	page,
	pages,
}: {
	recherche: Pick<Search, 'search' | 'city'>
	page: number
	pages: number
}) {
	if (pages <= 1) return null
	const link = 'min-h-[44px] px-2 py-2 font-semibold'
	return (
		<nav aria-label="Pages de résultats" className="mt-12 flex items-center justify-center gap-6 text-indigo-900">
			{page > 1 && (
				<a href={searchPageUrl({ ...recherche, page: page - 1 })} rel="prev" className={link}>
					Page précédente
				</a>
			)}
			<span aria-current="page">
				Page {page} sur {pages}
			</span>
			{page < pages && (
				<a href={searchPageUrl({ ...recherche, page: page + 1 })} rel="next" className={link}>
					Page suivante
				</a>
			)}
		</nav>
	)
}
