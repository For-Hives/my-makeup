import type { ProfileCard } from '@/services/public/profiles'
import { ResultCard } from './ResultCard'

/** The cards of a page whose photo loads at once. */
const PRIORITY_CARDS = 2

/** One list of cards. The first two cards of the page load at once: on a phone they are the pictures above the fold (ticket 303). */
export function ResultList({
	cartes,
	premiereDeLaPage = false,
	rangDuPremier = 1,
}: {
	cartes: readonly ProfileCard[]
	premiereDeLaPage?: boolean
	/** Rank (1-based) of the first card in the whole list of the search, for the measure of the clicks. */
	rangDuPremier?: number
}) {
	return (
		<ul className="grid w-full grid-cols-1 gap-3 md:gap-8 md:grid-cols-3 2xl:grid-cols-6">
			{cartes.map((carte, rang) => (
				<li key={carte.slug} className="col-span-1">
					<ResultCard
						carte={carte}
						prioritaire={premiereDeLaPage && rang < PRIORITY_CARDS}
						rang={rangDuPremier + rang}
					/>
				</li>
			))}
		</ul>
	)
}
