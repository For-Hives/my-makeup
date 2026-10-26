import { SubmissionTracking } from '@/components/analytics/SubmissionTracking'
import { Icon } from '@/components/art/graphics'
import { EVENT_CHOICES } from '@/lib/search/event-choices'

/**
 * The guided search of the home page (issue 1013): two fields with their labels in sight, and one button. A
 * plain form in GET that goes to the search page with `search` and `city`, the two parameters of the old form,
 * so the measure of the searches stays what it was. It needs no script and no account. The city is required:
 * without it, « Autre » would lead to a page that only asks what to type.
 *
 * The main action of the page, drawn by the hero « en arche » (decisions of 25/10/2026, docs/accueil.md): one white
 * pill where its box is wide enough (a container query on `.home-hero-search`), the two fields side by side over a
 * full-width button below that, and a card of two stacked fields over the button on a phone. Each field fills its
 * segment, so the select and the input are the 44 px targets; its line icon (a calendar, a pin: the icons of the art
 * direction kit, those of the search page) and its label sit over it without catching the press. The rules are in
 * globals.css, « Home hero ».
 */
export function GuidedSearch() {
	return (
		// biome-ignore lint/a11y/useSemanticElements: a <search> element is no landmark before Safari 17 and Chrome 118
		<form action="/search" method="get" role="search" className="guided-search">
			<SubmissionTracking />
			<div className="guided-search-field guided-search-event">
				<Icon name="calendar" className="guided-search-icon" />
				<label htmlFor="accueil-evenement" className="guided-search-label">
					Pour quel événement ?
				</label>
				<select
					id="accueil-evenement"
					name="search"
					defaultValue={EVENT_CHOICES[0]?.search}
					className="guided-search-control"
				>
					{EVENT_CHOICES.map(choice => (
						<option key={choice.label} value={choice.search}>
							{choice.label}
						</option>
					))}
				</select>
				<svg className="guided-search-chevron" viewBox="0 0 12 12" aria-hidden="true">
					<path d="M2.5 4.5 6 8l3.5-3.5" />
				</svg>
			</div>
			<div className="guided-search-field guided-search-place">
				<Icon name="pin" className="guided-search-icon" />
				<label htmlFor="accueil-lieu" className="guided-search-label">
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
					className="guided-search-control"
				/>
			</div>
			<button type="submit" className="guided-search-submit">
				Voir les maquilleuses
				<svg className="guided-search-arrow" viewBox="0 0 16 16" aria-hidden="true">
					<path d="M2 8h12M9 3l5 5-5 5" />
				</svg>
			</button>
		</form>
	)
}
