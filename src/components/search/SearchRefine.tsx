import { Chip } from '@/components/art/Chip'
import {
	bandLabel,
	filtersActive,
	type Layout,
	type PriceBand,
	type SearchFilters,
	SORT_LABELS,
	SORTS,
} from '@/lib/search/filters'
import { type Search, searchPageUrl } from '@/lib/search/input'

type Query = Pick<Search, 'search' | 'city'>

/** A group of choices: a fieldset named by its legend, then chips on one line that scrolls under 768 px. */
export function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
			<legend className="mb-2 p-0 font-semibold text-[13px] text-indigo-800 uppercase tracking-[0.14em]">
				{label}
			</legend>
			<div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
				{children}
			</div>
		</fieldset>
	)
}

/**
 * The filters, the sort, the layout and the count of the results, in the look of the kit (issue 1011). Every choice is a
 * plain link to the same search with that one thing changed (the word, the city and the other choices kept, the first
 * page): no form to submit, no script, an address to share. The links are plain `Link`s with no prefetch, since every
 * prefetch is a search the brake counts.
 *
 * - The speciality chips are the bullets a listed profile chose; the budget chips are cut from the real starting prices
 *   of the directory (`priceBands`) and are absent when there are too few prices. A budget in the address that no chip
 *   stands for (a shared link) is shown as a chip of its own, so it can be seen and left.
 * - Available makeup artists only: a profile on pause is not listed, so there is no availability choice to offer, and the
 *   line says it.
 */
export function SearchRefine({
	recherche: query,
	filtres: filters,
	specialites: specialties = [],
	tranches: bands = [],
	layout,
	total,
	baselineTotal,
}: {
	recherche: Query
	filtres: SearchFilters
	/** The speciality bullets offered: those a listed profile chose. */
	specialites?: readonly { value: string; label: string }[]
	/** The budgets offered, cut from the real starting prices (none when there are too few). */
	tranches?: readonly PriceBand[]
	layout: Layout
	/** The profiles shown, all pages. */
	total: number
	/** The profiles of the search without its filters. */
	baselineTotal: number
}) {
	const href = (change: Partial<SearchFilters> & { layout?: Layout }) =>
		searchPageUrl({ ...query, ...filters, layout, ...change })
	const budgetCurrent = (band: Pick<PriceBand, 'min' | 'max'>) =>
		filters.minPrice === band.min && filters.maxPrice === band.max
	const customBudget =
		(filters.minPrice !== null || filters.maxPrice !== null) && !bands.some(band => budgetCurrent(band))
	const customLabel =
		filters.minPrice !== null && filters.maxPrice !== null
			? bandLabel(filters.minPrice, filters.maxPrice)
			: filters.maxPrice !== null
				? `Jusqu’à ${filters.maxPrice} €`
				: bandLabel(filters.minPrice, null)
	const showBudget = bands.length > 0 || customBudget
	const noun = total === 1 ? 'maquilleuse' : 'maquilleuses'

	return (
		<div className="mb-10 grid gap-6 md:gap-7">
			<div className="grid gap-6 md:grid-cols-[minmax(0,auto)_minmax(0,auto)] md:gap-x-12 md:gap-y-6">
				{specialties.length > 0 && (
					<div className="md:col-span-2">
						<ChipGroup label="Spécialité">
							<Chip href={href({ specialty: null })} current={filters.specialty === null} prefetch={false}>
								Toutes
							</Chip>
							{specialties.map(({ value, label }) => (
								<Chip
									key={value}
									href={href({ specialty: value as SearchFilters['specialty'] })}
									current={filters.specialty === value}
									prefetch={false}
								>
									{label}
								</Chip>
							))}
						</ChipGroup>
					</div>
				)}
				{showBudget && (
					<ChipGroup label="Budget">
						<Chip
							href={href({ minPrice: null, maxPrice: null })}
							current={!customBudget && filters.minPrice === null && filters.maxPrice === null}
							prefetch={false}
						>
							Tous
						</Chip>
						{bands.map(band => (
							<Chip
								key={band.label}
								href={href({ minPrice: band.min, maxPrice: band.max })}
								current={budgetCurrent(band)}
								prefetch={false}
							>
								{band.label}
							</Chip>
						))}
						{customBudget && (
							<Chip href={href({ minPrice: filters.minPrice, maxPrice: filters.maxPrice })} current prefetch={false}>
								{customLabel}
							</Chip>
						)}
					</ChipGroup>
				)}
				<ChipGroup label="Trier par">
					{SORTS.map(sort => (
						<Chip key={sort} href={href({ sort })} current={filters.sort === sort} prefetch={false}>
							{SORT_LABELS[sort]}
						</Chip>
					))}
				</ChipGroup>
			</div>
			{(filters.minPrice !== null || filters.maxPrice !== null) && (
				<p className="text-mute text-sm">
					Les maquilleuses qui n’ont pas indiqué de tarif chiffré (« sur devis ») ne sont pas affichées avec un budget.
				</p>
			)}
			<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-hairline border-t pt-5">
				<p className="text-ink">
					<span className="font-semibold">
						{total} {noun}
					</span>
					{filtersActive(filters) && total !== baselineTotal && (
						<span className="text-mute"> avec ces filtres, sur {baselineTotal}</span>
					)}
					<span className="block text-mute text-sm md:inline md:before:content-['_·_']">
						Seules les maquilleuses disponibles sont listées.
					</span>
				</p>
				<div className="flex flex-wrap items-center gap-3">
					{filtersActive(filters) && (
						<a
							href={searchPageUrl({ ...query, layout })}
							className="inline-flex min-h-11 items-center font-semibold text-indigo-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
						>
							Réinitialiser
						</a>
					)}
					<fieldset className="m-0 flex min-w-0 gap-2 border-0 p-0">
						<legend className="sr-only">Présentation des résultats</legend>
						<Chip href={href({ layout: 'list' })} current={layout === 'list'} prefetch={false}>
							Liste
						</Chip>
						<Chip href={href({ layout: 'grid' })} current={layout === 'grid'} prefetch={false}>
							Grille
						</Chip>
					</fieldset>
				</div>
			</div>
		</div>
	)
}
