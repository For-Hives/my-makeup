import { viewsSentence } from '@/lib/dashboard/my-views'
import type { ViewRow } from '@/lib/views/profile-views'

const FORMAT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' })

/** `2026-10-23` as « 23 octobre » (the day is a day of Paris already: read in UTC, it does not move). */
const dayText = (day: string): string => FORMAT.format(new Date(`${day}T12:00:00.000Z`))

/**
 * « Ta page a été vue N fois » (ticket 1001): the views of her page, day by day over 30 days, her own and
 * nobody else's. `jours` is `null` when the reading failed. Her own visits do not count, and a reload of
 * the same tab neither. Renders on the server; the days are in a folded list, for a screen reader as for the eye.
 */
export function MyViews({ jours }: { jours: readonly ViewRow[] | null }) {
	if (jours === null)
		return (
			<section
				aria-labelledby="mes-vues-titre"
				data-testid="mes-vues"
				className="rounded border border-neutral-300 bg-white p-4 sm:p-5"
			>
				<h2 id="mes-vues-titre" className="font-semibold text-lg">
					Les vues de ta page
				</h2>
				<p className="mt-2">Les vues de ta page sont indisponibles pour le moment. Reviens dans un instant.</p>
			</section>
		)
	const max = Math.max(1, ...jours.map(({ count }) => count))
	return (
		<section
			aria-labelledby="mes-vues-titre"
			data-testid="mes-vues"
			className="w-full min-w-0 rounded border border-neutral-300 bg-white p-4 sm:p-5"
		>
			<h2 id="mes-vues-titre" className="font-semibold text-lg">
				Les vues de ta page
			</h2>
			<p data-testid="mes-vues-phrase" className="mt-2 font-medium">
				{viewsSentence(jours)}
			</p>
			<div aria-hidden="true" className="mt-3 flex h-16 items-end gap-px">
				{jours.map(({ day, count }) => (
					<div
						key={day}
						className="min-w-0 flex-1 rounded-t bg-indigo-700"
						style={{ height: count === 0 ? '2px' : `${Math.max(6, Math.round((count / max) * 100))}%` }}
					/>
				))}
			</div>
			<p className="mt-2 text-neutral-700 text-sm">
				Une vue est comptée une fois par onglet. Tes propres visites et les robots ne comptent pas.
			</p>
			<details className="mt-2">
				<summary className="inline-flex min-h-11 cursor-pointer items-center font-medium underline">
					Voir jour par jour
				</summary>
				<ul data-testid="mes-vues-jours" className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
					{[...jours].reverse().map(({ day, count }) => (
						<li key={day} className="flex justify-between gap-3 border-neutral-200 border-b py-1 text-sm">
							<span>{dayText(day)}</span>
							<span className="font-medium">{count}</span>
						</li>
					))}
				</ul>
			</details>
		</section>
	)
}
