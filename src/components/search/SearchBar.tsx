import type { ReactNode } from 'react'
import { SubmissionTracking } from '@/components/analytics/SubmissionTracking'
import { GlowBlob, Icon, PrintMark } from '@/components/art/graphics'
import { pillClassName } from '@/components/art/Pill'

const FIELD =
	'min-h-13 w-full rounded-full border border-ink bg-white py-2.5 pr-5 pl-13 text-base text-ink placeholder:text-mute focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700'

/**
 * The search bar of the search page, in the look of the kit: two pill fields (what, where) and one button, a plain
 * form in GET that goes to `/search` with `search` and `city`, so the measure of the searches stays what it was. It
 * needs no script. It is its own form, apart from the filters: a filter is the same search, so it carries no
 * submission mark. `heading` is the title of the page, put above the form when the page has no results to title.
 * The glow and the marks are decoration (`aria-hidden`, nothing said by them).
 */
export function SearchBar({
	search = '',
	city = '',
	heading,
}: {
	/** What the fields hold: the search of the address. */
	search?: string
	city?: string
	heading?: ReactNode
}) {
	return (
		<div className="relative isolate overflow-hidden border-hairline border-b bg-art-paper">
			<GlowBlob size="lg" tone="rose" className="-top-72 -right-80 -z-10" />
			<GlowBlob size="md" tone="indigo" className="-bottom-80 -left-64 -z-10 opacity-40" />
			<span aria-hidden="true" className="pointer-events-none absolute top-8 right-[8%] hidden text-art-line md:block">
				<PrintMark kind="plus" className="h-5 w-5" />
			</span>
			<div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-16 md:py-12">
				{heading}
				{/* biome-ignore lint/a11y/useSemanticElements: a <search> element is no landmark before Safari 17 and Chrome 118 */}
				<form
					action="/search"
					method="get"
					role="search"
					className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:gap-4"
				>
					<SubmissionTracking />
					<div className="relative">
						<label htmlFor="recherche-prestation" className="sr-only">
							Prestation recherchée
						</label>
						<Icon
							name="search"
							className="pointer-events-none absolute top-1/2 left-5 h-5 w-5 -translate-y-1/2 text-indigo-700"
						/>
						<input
							id="recherche-prestation"
							name="search"
							type="search"
							maxLength={100}
							defaultValue={search}
							className={FIELD}
							placeholder="Mariage, soirée, photo…"
						/>
					</div>
					<div className="relative">
						<label htmlFor="recherche-ville" className="sr-only">
							Ville de la prestation
						</label>
						<Icon
							name="pin"
							className="pointer-events-none absolute top-1/2 left-5 h-5 w-5 -translate-y-1/2 text-indigo-700"
						/>
						<input
							id="recherche-ville"
							name="city"
							type="text"
							maxLength={100}
							defaultValue={city}
							autoComplete="address-level2"
							className={FIELD}
							placeholder="Ville ou code postal"
						/>
					</div>
					<button type="submit" className={`${pillClassName({ variant: 'filled' })} w-full md:w-auto`}>
						Trouver une maquilleuse
					</button>
				</form>
			</div>
		</div>
	)
}
