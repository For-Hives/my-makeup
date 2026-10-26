import type { Tint } from '@/components/art/CapsuleImage'
import { ProfileCard, ProfileRowCard } from '@/components/art/ProfileCard'
import type { Layout } from '@/lib/search/filters'
import type { ProfileCard as ProfileCardData } from '@/services/public/profiles'

/** The cards of a page whose photo loads at once. */
const PRIORITY_CARDS = 2

/** The tint behind a photo, in turn: the kit's pale colours, so a page of results is not one flat rose. */
const TINTS: readonly Tint[] = ['blush', 'lavender', 'sand', 'rose']

/**
 * One list of results in the look of the kit: a row card per profile (`list`) or a vertical card (`grid`). Each card
 * keeps the rules of the card of the search: one stretched link, the click reported with its rank, an empty zone said,
 * « dès X € » only when a price exists, no contact detail. The first two cards of the first page load their photo at
 * once. Without `rangDuPremier` the cards report no rank (a list that is not a search result).
 */
export function SearchGrid({
	cartes,
	layout = 'list',
	premiereDeLaPage = false,
	rangDuPremier,
	headingLevel = 3,
	rail = false,
}: {
	cartes: readonly ProfileCardData[]
	layout?: Layout
	premiereDeLaPage?: boolean
	/** Rank (1-based) of the first card in the whole list of the search, for the measure of the clicks. */
	rangDuPremier?: number
	headingLevel?: 2 | 3
	/** Vertical cards on one line that slides under 768 px (a short row, not a page of results). `grid` only. */
	rail?: boolean
}) {
	const Card = layout === 'grid' ? ProfileCard : ProfileRowCard
	return (
		<ul
			data-layout={layout}
			className={
				rail
					? '-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-5 overflow-x-auto px-4 pb-4 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-[repeat(3,minmax(0,1fr))] md:gap-x-8 md:gap-y-12 md:overflow-visible md:px-0'
					: layout === 'grid'
						? 'grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-12 sm:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[repeat(3,minmax(0,1fr))]'
						: 'grid grid-cols-[minmax(0,1fr)] gap-4 md:gap-5'
			}
		>
			{cartes.map((carte, index) => (
				<li
					key={carte.slug}
					className={
						rail
							? 'reveal w-[78%] max-w-sm flex-none snap-start [overflow-wrap:anywhere] md:w-auto md:max-w-none'
							: 'reveal [overflow-wrap:anywhere]'
					}
				>
					<Card
						profile={carte}
						priority={premiereDeLaPage && index < PRIORITY_CARDS}
						rank={rangDuPremier === undefined ? undefined : rangDuPremier + index}
						headingLevel={headingLevel}
						tint={TINTS[index % TINTS.length]}
					/>
				</li>
			))}
		</ul>
	)
}
