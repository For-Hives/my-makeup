import { SubmissionTracking } from '@/components/analytics/SubmissionTracking'
import { EVENT_CHOICES } from '@/lib/search/event-choices'

const CONTROL =
	'min-h-[44px] w-full rounded-lg border-2 border-indigo-900 bg-white px-3 py-2 text-base text-gray-900 placeholder:text-gray-600'

/**
 * The guided search of the home page (issue 1013): two fields with their labels in sight, and one button. A
 * plain form in GET that goes to the search page with `search` and `city`, the two parameters of the old form,
 * so the measure of the searches stays what it was. It needs no script and no account. The city is required:
 * without it, « Autre » would lead to a page that only asks what to type.
 */
export function GuidedSearch() {
	return (
		<div className="w-full rounded-2xl bg-white p-4 shadow-xl ring-1 ring-gray-200 sm:p-6">
			{/* biome-ignore lint/a11y/useSemanticElements: a <search> element is no landmark before Safari 17 and Chrome 118 */}
			<form action="/search" method="get" role="search" className="flex flex-col gap-4">
				<SubmissionTracking />
				<div className="flex flex-col gap-1">
					<label htmlFor="accueil-evenement" className="font-semibold text-gray-900 text-sm">
						Pour quel événement ?
					</label>
					<select id="accueil-evenement" name="search" defaultValue={EVENT_CHOICES[0]?.search} className={CONTROL}>
						{EVENT_CHOICES.map(choice => (
							<option key={choice.label} value={choice.search}>
								{choice.label}
							</option>
						))}
					</select>
				</div>
				<div className="flex flex-col gap-1">
					<label htmlFor="accueil-lieu" className="font-semibold text-gray-900 text-sm">
						Où ?
					</label>
					<input
						id="accueil-lieu"
						name="city"
						type="text"
						required
						maxLength={100}
						autoComplete="address-level2"
						placeholder="Ville ou code postal"
						className={CONTROL}
					/>
				</div>
				<button type="submit" className="btn-primary min-h-[44px] w-full">
					Voir les maquilleuses
				</button>
			</form>
		</div>
	)
}
