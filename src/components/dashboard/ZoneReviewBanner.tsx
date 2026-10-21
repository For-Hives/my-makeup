'use client'

import { reviewButtons, reviewMessage, type ZoneReviewView } from '@/lib/dashboard/zone-review'

/**
 * The banner of a zone to review (ticket 265; PLAN-ZONES.md §3.3): the import could not decide the
 * commune of this profile. With a postal code that several communes share, it names the code and
 * offers each commune as a button, and a tap saves it (the parent sends the INSEE code like any
 * other choice of a commune). Without one, it says the zone was not taken over and asks for a
 * commune or a country. Only the owner's space shows it: the review is a private field.
 */
export function ZoneReviewBanner({
	revue,
	enCours,
	message,
	onChoisir,
}: {
	revue: ZoneReviewView
	/** A save is running: the buttons wait. */
	enCours: boolean
	/** The failure of the last tap, in French. */
	message: string
	onChoisir: (codeInsee: string) => void
}) {
	const buttons = reviewButtons(revue)
	return (
		<section
			aria-label="Zone à revoir"
			data-testid="zone-a-revoir"
			className="flex w-full flex-col gap-3 rounded-md border border-amber-400 bg-amber-50 p-3 text-amber-950"
		>
			<p className="text-sm">{reviewMessage(revue)}</p>
			{buttons.length > 0 ? (
				<ul className="flex flex-wrap gap-2">
					{buttons.map(commune => (
						<li key={commune.codeInsee}>
							<button
								type="button"
								disabled={enCours}
								onClick={() => onChoisir(commune.codeInsee)}
								className="min-h-11 rounded-md border border-amber-700 bg-white px-4 py-2 font-medium text-base text-neutral-900 disabled:cursor-wait disabled:opacity-60"
							>
								{commune.libelle}
							</button>
						</li>
					))}
				</ul>
			) : null}
			<div role="alert">
				{message ? <p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">{message}</p> : null}
			</div>
		</section>
	)
}
