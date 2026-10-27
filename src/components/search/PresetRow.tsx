import { RankingLink } from '@/components/ranking/RankingLink'
import type { Preset } from '@/lib/search/preset'
import type { DirectoryProfile } from '@/services/public/profiles'
import { SearchGrid } from './SearchGrid'

/**
 * The preset of the search page when nothing was typed: « Les plus consultées en France », or « Les mieux classées » when
 * the visits do not say enough (src/lib/search/preset.ts). The title and the sentence under it say the criterion as it is.
 * The cards report no rank: they are not a search result, and the series of `search_result_click` stays the search.
 * Their click is a `card_click` (`plus_consultees` or `classement`, by the kind of the preset).
 * Nothing is drawn when there is nobody to show.
 */
export function PresetRow({ preset }: { preset: Preset<Pick<DirectoryProfile, 'carte'>> }) {
	if (preset.profiles.length === 0) return null
	return (
		<section aria-labelledby="recherche-selection" className="relative">
			<div className="reveal mb-8 max-w-2xl">
				<h2
					id="recherche-selection"
					className="text-balance font-display font-medium text-3xl text-ink leading-[1.08] md:text-4xl"
				>
					{preset.title}
				</h2>
				<p className="mt-3 text-mute">{preset.intro}</p>
			</div>
			<SearchGrid
				cartes={preset.profiles.map(({ carte }) => carte)}
				layout="grid"
				premiereDeLaPage
				rail
				origin={preset.kind === 'most-viewed' ? 'plus_consultees' : 'classement'}
			/>
			<RankingLink className="mt-8" />
		</section>
	)
}
