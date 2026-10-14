'use client'

import { useActionState, useEffect, useRef } from 'react'
import { type CodeEchecDeLaDemande, MESSAGES_MOT_DE_PASSE } from '@/lib/auth/mot-de-passe-oublie'

export type EtatDeLaDemande = { envoyee: true } | { code: CodeEchecDeLaDemande } | null
export type ActionDeLaDemande = (precedent: EtatDeLaDemande, formulaire: FormData) => Promise<EtatDeLaDemande>

/**
 * The first step of the forgotten password. Once sent, the form gives way to the one sentence the
 * site always answers: it says nothing about the address. A key held down sends one request, as in
 * the sign-in form.
 */
export function FormulaireMotDePasseOublie({ action }: { action: ActionDeLaDemande }) {
	const [etat, envoyer, enCours] = useActionState(action, null)
	const verrou = useRef(false)

	useEffect(() => {
		if (!enCours) verrou.current = false
	}, [enCours, etat])

	if (etat && 'envoyee' in etat)
		return (
			<p
				role="status"
				data-testid="oubli-envoye"
				className="max-w-sm rounded-md bg-indigo-50 p-3 text-indigo-900 text-sm"
			>
				{MESSAGES_MOT_DE_PASSE.envoyee}
			</p>
		)

	return (
		<form
			action={envoyer}
			noValidate
			onSubmit={evenement => {
				if (verrou.current) evenement.preventDefault()
				else verrou.current = true
			}}
			className="flex w-full max-w-sm flex-col gap-4 text-left"
		>
			<p className="text-neutral-700 text-sm">
				Indique l’adresse email de ton compte : tu recevras un lien pour choisir un nouveau mot de passe.
			</p>
			<label className="flex flex-col gap-1 font-medium text-sm" htmlFor="email">
				Adresse email
				<input
					id="email"
					name="email"
					type="email"
					inputMode="email"
					autoComplete="email"
					required
					className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-normal text-base"
				/>
			</label>
			<div role="alert" data-testid="erreur-oubli">
				{etat && 'code' in etat ? (
					<p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">{MESSAGES_MOT_DE_PASSE[etat.code]}</p>
				) : null}
			</div>
			<button
				type="submit"
				disabled={enCours}
				aria-busy={enCours}
				className="min-h-11 rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:cursor-wait disabled:opacity-60"
			>
				{enCours ? 'Envoi…' : 'Recevoir un lien'}
			</button>
		</form>
	)
}
