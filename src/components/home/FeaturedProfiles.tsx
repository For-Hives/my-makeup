import { ResultCard } from '@/components/search/ResultCard'
import type { ProfileCard } from '@/services/public/profiles'

/**
 * « Mise en avant » (issue 1066): the makeup artists the team picked for the home page, six at most. The cards are
 * those of the search; their click reports nothing, so the series of the search stays the search. Without a card
 * there is no block, no title and no empty space. No picture is loaded ahead of the others: the head of the page is.
 */
export function FeaturedProfiles({ cartes }: { cartes: readonly ProfileCard[] }) {
	if (cartes.length === 0) return null
	return (
		<section
			aria-labelledby="accueil-mise-en-avant"
			data-testid="maquilleuses-mises-en-avant"
			className="px-4 py-12 md:px-8"
		>
			<div className="mx-auto max-w-7xl">
				<h2 id="accueil-mise-en-avant" className="font-bold text-2xl text-gray-900 tracking-tight md:text-3xl">
					Mise en avant
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
