import { RankingLink } from '@/components/ranking/RankingLink'
import { ResultCard } from '@/components/search/ResultCard'
import type { ProfileCard } from '@/services/public/profiles'

/**
 * Makeup artists under a page of text (ticket 305): the page of a speciality (six cards, « Des
 * maquilleuses pour votre … ») and the foot of an article (three cards, smaller). The cards are those of
 * the search; their click reports nothing, so the series of the search stays the search. A field « Votre
 * ville » leads to the search, with the speciality when the page has one: a plain form in GET, which
 * works without a script. Without a card there is no block, and no field either.
 */
export function ProfileBlock({
	titre,
	cartes,
	specialite,
	compact = false,
}: {
	titre: string
	cartes: readonly ProfileCard[]
	/** What the search is asked for, when the page is about a speciality (the title of the talent). */
	specialite?: string
	compact?: boolean
}) {
	if (cartes.length === 0) return null
	const headingId = compact ? 'maquilleuses-article' : 'maquilleuses-talent'
	return (
		<section aria-labelledby={headingId} data-testid="bloc-maquilleuses" className="mt-16 md:mt-24">
			<h2
				id={headingId}
				className={`font-bold text-gray-900 tracking-tight ${compact ? 'text-xl md:text-2xl' : 'text-2xl md:text-3xl'}`}
			>
				{titre}
			</h2>
			<ul
				className={`mt-6 grid grid-cols-1 gap-3 md:gap-6 ${compact ? 'md:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-3'}`}
			>
				{cartes.map(carte => (
					<li key={carte.slug} className="reveal">
						<ResultCard carte={carte} prioritaire={false} />
					</li>
				))}
			</ul>
			<RankingLink className="mt-4" />
			<form action="/search" method="get" className="reveal mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
				{specialite !== undefined && <input type="hidden" name="specialite" value={specialite} />}
				<div className="flex-1">
					<label htmlFor={`${headingId}-ville`} className="block font-semibold text-gray-900 text-sm leading-6">
						Votre ville
					</label>
					<input
						id={`${headingId}-ville`}
						type="text"
						name="city"
						autoComplete="address-level2"
						placeholder="Annecy"
						className="mt-1 block min-h-11 w-full rounded-md border-0 px-3.5 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-500 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
					/>
				</div>
				<button type="submit" className="btn-primary min-h-11">
					Voir les maquilleuses
				</button>
			</form>
		</section>
	)
}
