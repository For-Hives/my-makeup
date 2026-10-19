'use client'

import { useActionState } from 'react'

export type ResendState = { reussi?: string; erreur?: string; valeur?: string } | null
export type ResendAction = (precedent: ResendState, formulaire: FormData) => Promise<ResendState>

/**
 * The resending of the confirmation mail, on the wall of verification (ticket 083). One field, the
 * address; the answer is the same whether or not an account waits behind it.
 */
export function ResendForm({ action }: { action: ResendAction }) {
	const [state, send, inProgress] = useActionState(action, null)
	return (
		<form action={send} noValidate className="flex w-full max-w-sm flex-col gap-3 text-left">
			<label className="flex flex-col gap-1 font-medium text-sm" htmlFor="email-renvoi">
				Adresse email de ton inscription
				<input
					// Remounted with each answer: React empties a form once its action has answered, and the address she typed must stay.
					key={state?.valeur ?? ''}
					id="email-renvoi"
					name="email"
					type="email"
					inputMode="email"
					autoComplete="email"
					defaultValue={state?.valeur}
					aria-describedby="retour-renvoi"
					aria-invalid={state?.erreur ? true : undefined}
					className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-normal text-base aria-[invalid=true]:border-red-600"
				/>
			</label>
			<div id="retour-renvoi" role="status" data-testid="retour-renvoi">
				{state?.reussi ? <p className="rounded-md bg-green-50 p-3 text-green-900 text-sm">{state.reussi}</p> : null}
				{state?.erreur ? <p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">{state.erreur}</p> : null}
			</div>
			<button
				type="submit"
				disabled={inProgress}
				aria-busy={inProgress}
				className="min-h-11 rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:cursor-wait disabled:opacity-60"
			>
				{inProgress ? 'Envoi…' : 'Renvoyer l’email de confirmation'}
			</button>
		</form>
	)
}
