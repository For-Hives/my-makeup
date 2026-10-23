import { ResultCard } from '@/components/search/ResultCard'
import type { ProfileCard } from '@/services/public/profiles'

/**
 * « Récemment mises à jour » (issue 1013): the makeup artists whose profile was saved most recently, three at
 * most. The cards are those of the search; their click reports nothing, so the series of the search stays the
 * search. Without a card there is no block. No picture is loaded ahead of the others: the picture of the page is.
 */
export function RecentProfiles({ cartes }: { cartes: readonly ProfileCard[] }) {
	if (cartes.length === 0) return null
	return (
		<section aria-labelledby="accueil-recentes" data-testid="maquilleuses-recentes" className="px-4 py-12 md:px-8">
			<div className="mx-auto max-w-7xl">
				<h2 id="accueil-recentes" className="font-bold text-2xl text-gray-900 tracking-tight md:text-3xl">
					Récemment mises à jour
				</h2>
				<ul className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-6">
					{cartes.map(carte => (
						<li key={carte.slug}>
							<ResultCard carte={carte} prioritaire={false} />
						</li>
					))}
				</ul>
			</div>
		</section>
	)
}
