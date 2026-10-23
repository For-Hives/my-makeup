'use client'

import { useRef } from 'react'
import type { DECLARED_ORIGINS } from '@/lib/analytics/events'
import { ORIGINES_DECLAREES, ORIGINS_LABELS } from '@/lib/dashboard/onboarding'

export type Origin = (typeof DECLARED_ORIGINS)[number]

/**
 * « Comment as-tu connu My Makeup ? » (decision UI-05): one optional answer. It is kept out of the
 * form, of the schema and of every request: nothing about it is stored. The parent counts it (ticket 148)
 * as the `onboarding_source` event once the first step is stored, and nowhere else.
 */
export function OriginQuestion({ origine, choisir }: { origine: Origin | null; choisir: (o: Origin | null) => void }) {
	const first = useRef<HTMLInputElement>(null)
	return (
		<fieldset aria-describedby="accueil-origine-aide" className="flex flex-col gap-1 rounded-2xl bg-nude-100 p-4">
			<legend className="px-1 font-medium text-sm">
				Comment as-tu connu My&nbsp;Makeup&nbsp;? <span className="font-normal text-mute">(facultatif)</span>
			</legend>
			<p id="accueil-origine-aide" className="text-mute text-sm">
				Ta réponse sert seulement à nos statistiques : elle n’est enregistrée ni dans ton compte ni dans ton profil.
			</p>
			<div className="mt-1 flex flex-col">
				{ORIGINES_DECLAREES.map((valeur, rang) => (
					<label
						key={valeur}
						htmlFor={`accueil-origine-${valeur}`}
						className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm"
					>
						<input
							ref={rang === 0 ? first : undefined}
							id={`accueil-origine-${valeur}`}
							type="radio"
							name="origine"
							value={valeur}
							checked={origine === valeur}
							onChange={() => choisir(valeur)}
							className="size-5 shrink-0 accent-lipstick"
						/>
						{ORIGINS_LABELS[valeur]}
					</label>
				))}
			</div>
			{origine !== null ? (
				<button
					type="button"
					onClick={() => {
						choisir(null)
						first.current?.focus()
					}}
					className="min-h-11 w-fit px-2 text-sm underline"
				>
					Effacer ma réponse
				</button>
			) : null}
		</fieldset>
	)
}
