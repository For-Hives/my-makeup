import { type Recherche, urlPageRecherche } from '@/lib/recherche/saisie'

/**
 * The links between the pages of the results (ticket 100): « Page précédente », « Page 2 sur 3 »,
 * « Page suivante », each keeping the word and the city of the address. Plain links, not `next/link`: a
 * link of Next would prefetch the next page, and every prefetch is a search the brake counts.
 */
export function PagesDeResultats({
	recherche,
	page,
	pages,
}: {
	recherche: Pick<Recherche, 'search' | 'city'>
	page: number
	pages: number
}) {
	if (pages <= 1) return null
	const lien = 'min-h-[44px] px-2 py-2 font-semibold'
	return (
		<nav aria-label="Pages de résultats" className="mt-12 flex items-center justify-center gap-6 text-indigo-900">
			{page > 1 && (
				<a href={urlPageRecherche({ ...recherche, page: page - 1 })} rel="prev" className={lien}>
					Page précédente
				</a>
			)}
			<span aria-current="page">
				Page {page} sur {pages}
			</span>
			{page < pages && (
				<a href={urlPageRecherche({ ...recherche, page: page + 1 })} rel="next" className={lien}>
					Page suivante
				</a>
			)}
		</nav>
	)
}
