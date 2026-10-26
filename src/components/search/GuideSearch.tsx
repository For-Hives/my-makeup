import { SubmissionTracking } from '@/components/analytics/SubmissionTracking'
import { Icon } from '@/components/art/graphics'
import { pillClassName } from '@/components/art/Pill'

const FIELD =
	'min-h-13 w-full rounded-full border border-ink bg-white py-2.5 pr-5 pl-13 text-base text-ink placeholder:text-mute focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700'

/**
 * The search form under the head of the guides and of « Pourquoi particulier » (issue 1138): the same family as the
 * bar of the search page (`SearchBar`), two pill fields (what, where) and one button on ONE line from 768 px up, one
 * under the other on a phone. A plain form in GET to `/search` with `search` and `city`, with the submission mark of
 * the measure, and no script. The labels are there for screen readers (`sr-only`), the placeholders only give an
 * example. It replaces `SearchBlock` on these pages; the home page's own search is another component.
 */
export function GuideSearch() {
	return (
		<div className="relative z-10 mx-auto w-full max-w-5xl rounded-art-frame border border-hairline bg-white p-4 shadow-art-lift md:p-5">
			{/* biome-ignore lint/a11y/useSemanticElements: a <search> element is no landmark before Safari 17 and Chrome 118 */}
			<form
				action="/search"
				method="get"
				role="search"
				className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center md:gap-4"
			>
				<SubmissionTracking />
				<div className="relative">
					<label htmlFor="guide-prestation" className="sr-only">
						Prestation recherchée
					</label>
					<Icon
						name="search"
						className="pointer-events-none absolute top-1/2 left-5 h-5 w-5 -translate-y-1/2 text-indigo-700"
					/>
					<input
						id="guide-prestation"
						name="search"
						type="search"
						maxLength={100}
						className={FIELD}
						placeholder="Mariage, soirée, photo…"
					/>
				</div>
				<div className="relative">
					<label htmlFor="guide-ville" className="sr-only">
						Ville de la prestation
					</label>
					<Icon
						name="pin"
						className="pointer-events-none absolute top-1/2 left-5 h-5 w-5 -translate-y-1/2 text-indigo-700"
					/>
					<input
						id="guide-ville"
						name="city"
						type="text"
						maxLength={100}
						autoComplete="address-level2"
						className={FIELD}
						placeholder="Ville ou code postal"
					/>
				</div>
				<button type="submit" className={`${pillClassName({ variant: 'filled' })} w-full whitespace-nowrap md:w-auto`}>
					Trouver une maquilleuse
				</button>
			</form>
		</div>
	)
}
