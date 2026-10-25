import type { ArchBand } from '@/components/art/ArchImage'
import type { Tint } from '@/components/art/CapsuleImage'
import { Pill } from '@/components/art/Pill'
import { ProfileCard } from '@/components/art/ProfileCard'
import { RankingLink } from '@/components/ranking/RankingLink'
import type { ProfileCard as ProfileCardData } from '@/services/public/profiles'

const TINTS: readonly Tint[] = ['blush', 'lavender', 'sand', 'rose']
const BANDS: readonly ArchBand[] = ['band', 'rose', 'night']

/**
 * The makeup artists under a zone page or a talent page, in the kit's look: the kit's arch cards in a grid (tint and band
 * cycle, so the arches differ), the link to the ranking, and the « Votre ville » field, a plain form in GET that works
 * without a script (the rules of `ProfileBlock`: the cards report no click, so the series of the search stays the
 * search; with no card there is no block and no field). `specialite` is what the search is asked for on a talent page.
 */
export function ProfileGrid({
	titre,
	cartes,
	specialite,
}: {
	titre: string
	cartes: readonly ProfileCardData[]
	specialite?: string
}) {
	if (cartes.length === 0) return null
	const headingId = 'maquilleuses-talent'
	return (
		<section aria-labelledby={headingId} data-testid="bloc-maquilleuses" className="mt-4 md:mt-8">
			<h2
				id={headingId}
				className="reveal max-w-3xl text-balance font-display font-medium text-3xl text-ink leading-[1.1] tracking-tight md:text-4xl lg:text-[2.6rem]"
			>
				{titre}
			</h2>
			<ul className="mt-12 grid list-none grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-14 p-0 sm:grid-cols-2 lg:grid-cols-3">
				{cartes.map((carte, index) => (
					<li key={carte.slug} className="reveal min-w-0 pr-4 [&_article>.grid]:grid-cols-[minmax(0,1fr)]">
						<ProfileCard
							profile={carte}
							tint={TINTS[index % TINTS.length] ?? 'blush'}
							band={BANDS[index % BANDS.length] ?? 'band'}
						/>
					</li>
				))}
			</ul>
			<RankingLink className="mt-8" />
			<form
				action="/search"
				method="get"
				className="reveal mt-10 flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-end"
			>
				{specialite !== undefined && <input type="hidden" name="specialite" value={specialite} />}
				<div className="flex-1">
					<label htmlFor={`${headingId}-ville`} className="block font-semibold text-ink text-sm leading-6">
						Votre ville
					</label>
					<input
						id={`${headingId}-ville`}
						type="text"
						name="city"
						autoComplete="address-level2"
						placeholder="Annecy"
						className="mt-1 block min-h-13 w-full rounded-full border-0 bg-white px-6 py-2 text-base text-ink ring-1 ring-art-line ring-inset placeholder:text-mute focus:ring-2 focus:ring-indigo-700 focus:ring-inset"
					/>
				</div>
				<Pill type="submit" variant="filled" arrow>
					Voir les maquilleuses
				</Pill>
			</form>
		</section>
	)
}
