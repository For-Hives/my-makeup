import type { ReactNode } from 'react'
import type { Card } from '@/lib/dashboard/cards'

/** What a card shows for a line with nothing stored: never « null », never a blank. */
export const TO_COMPLETE = 'à compléter'

function Value({ valeur }: { valeur: string | null }) {
	return valeur === null ? (
		<span className="text-neutral-600 italic">{TO_COMPLETE}</span>
	) : (
		<span className="whitespace-pre-line break-words">{valeur}</span>
	)
}

/**
 * One section of her profile on the page of her space (ticket 118): a title (h2), the value stored
 * on each line or « à compléter », and the slot of the button « Modifier » that each section plugs
 * in as it arrives. A server component: it shows what it is given.
 */
export function SectionCard({ carte, action }: { carte: Card; action?: ReactNode }) {
	const labels = carte.lignes.some(ligne => ligne.libelle !== undefined)
	return (
		<section
			aria-labelledby={`carte-${carte.section}`}
			data-testid={`carte-${carte.section}`}
			className="w-full min-w-0 rounded border border-neutral-300 bg-white p-5 sm:p-6"
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<h2 id={`carte-${carte.section}`} className="font-bold text-neutral-800 text-xl">
					{carte.titre}
				</h2>
				{action}
			</div>
			{labels ? (
				<dl className="mt-3 flex flex-col gap-2">
					{carte.lignes.map(ligne => (
						<div key={ligne.libelle} className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:gap-3">
							<dt className="shrink-0 font-medium text-neutral-700 text-sm sm:w-48">{ligne.libelle}</dt>
							<dd className="min-w-0">
								<Value valeur={ligne.valeur} />
							</dd>
						</div>
					))}
				</dl>
			) : (
				<ul className="mt-3 flex flex-col gap-1.5">
					{carte.lignes.map((ligne, rang) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: the lines are text of a card, never reordered here
						<li key={`${rang}-${ligne.valeur}`} className="min-w-0">
							<Value valeur={ligne.valeur} />
						</li>
					))}
				</ul>
			)}
		</section>
	)
}
