import { ResultCard } from '@/components/search/ResultCard'
import { FEATURED_LIST_CLASS, FEATURED_MAX, featuredDrawScript } from '@/lib/profile/featured'
import type { ProfileCard } from '@/services/public/profiles'

/**
 * « Mise en avant » (issue 1066): verified makeup artists, drawn at random at each load of the page, six at
 * most. The HTML of the home page is cached and the same for everyone, so the server cannot draw: it carries the
 * candidates (`cartes`, the verified profiles, in the order of the directory), the stylesheet shows the first six
 * (without JavaScript the block is complete and stable), and an inline script, placed before the list, swaps that
 * rule for a random six (src/lib/profile/featured.ts). It touches no node, loads no module and ships no client
 * component: the bundles do not grow, the block always holds six cards (CLS 0), and a hidden card loads no picture
 * (none is `priority`). The cards are those of the search; their click reports nothing, so the series of the search
 * stays the search. Without a card there is no block, no title and no empty space.
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
				{cartes.length > FEATURED_MAX && (
					// biome-ignore lint/security/noDangerouslySetInnerHtml: the script is built from two integers, no data of a profile.
					<script dangerouslySetInnerHTML={{ __html: featuredDrawScript(cartes.length, FEATURED_MAX) }} />
				)}
				<ul className={`${FEATURED_LIST_CLASS} mt-6 grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-6`}>
					{cartes.map(carte => (
						<li key={carte.slug} className="reveal">
							<ResultCard carte={carte} prioritaire={false} />
						</li>
					))}
				</ul>
			</div>
		</section>
	)
}
