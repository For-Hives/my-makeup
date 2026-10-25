'use client'

import { useActionState } from 'react'
import { ART_FIELD, ART_LABEL, ART_NOTICE, ART_SUBMIT } from '@/components/art/form-classes'

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
			<label className={ART_LABEL} htmlFor="email-renvoi">
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
					className={ART_FIELD}
				/>
			</label>
			<div id="retour-renvoi" role="status" data-testid="retour-renvoi">
				{state?.reussi ? <p className={ART_NOTICE.success}>{state.reussi}</p> : null}
				{state?.erreur ? <p className={ART_NOTICE.error}>{state.erreur}</p> : null}
			</div>
			<button type="submit" disabled={inProgress} aria-busy={inProgress} className={ART_SUBMIT}>
				{inProgress ? 'Envoi…' : 'Renvoyer l’email de confirmation'}
			</button>
		</form>
	)
}
