'use client'

import { useActionState } from 'react'

export type EtatDeRenvoi = { reussi?: string; erreur?: string; valeur?: string } | null
export type ActionDeRenvoi = (precedent: EtatDeRenvoi, formulaire: FormData) => Promise<EtatDeRenvoi>

/**
 * The resending of the confirmation mail, on the wall of verification (ticket 083). One field, the
 * address; the answer is the same whether or not an account waits behind it.
 */
export function FormulaireDeRenvoi({ action }: { action: ActionDeRenvoi }) {
	const [etat, envoyer, enCours] = useActionState(action, null)
	return (
		<form action={envoyer} noValidate className="flex w-full max-w-sm flex-col gap-3 text-left">
			<label className="flex flex-col gap-1 font-medium text-sm" htmlFor="email-renvoi">
				Adresse email de ton inscription
				<input
					// Remounted with each answer: React empties a form once its action has answered, and the address she typed must stay.
					key={etat?.valeur ?? ''}
					id="email-renvoi"
					name="email"
					type="email"
					inputMode="email"
					autoComplete="email"
					defaultValue={etat?.valeur}
					aria-describedby="retour-renvoi"
					aria-invalid={etat?.erreur ? true : undefined}
					className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-normal text-base aria-[invalid=true]:border-red-600"
				/>
			</label>
			<div id="retour-renvoi" role="status" data-testid="retour-renvoi">
				{etat?.reussi ? <p className="rounded-md bg-green-50 p-3 text-green-900 text-sm">{etat.reussi}</p> : null}
				{etat?.erreur ? <p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">{etat.erreur}</p> : null}
			</div>
			<button
				type="submit"
				disabled={enCours}
				aria-busy={enCours}
				className="min-h-11 rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:cursor-wait disabled:opacity-60"
			>
				{enCours ? 'Envoi…' : 'Renvoyer l’email de confirmation'}
			</button>
		</form>
	)
}
