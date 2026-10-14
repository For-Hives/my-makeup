'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef } from 'react'
import { type CodeErreur, messageErreur } from '@/lib/auth/erreurs'

export type EtatDeConnexion = { code: CodeErreur } | null
export type ActionDeConnexion = (precedent: EtatDeConnexion, formulaire: FormData) => Promise<EtatDeConnexion>

/**
 * The sign-in form. The error is a `role="alert"` under the form: it is announced by a screen
 * reader, and the address does not change. A key held down sends one request: React would queue
 * every submit, so the form refuses the next one until the first has answered.
 */
export function FormulaireDeConnexion({ action, retour }: { action: ActionDeConnexion; retour: string }) {
	const [etat, envoyer, enCours] = useActionState(action, null)
	const verrou = useRef(false)

	useEffect(() => {
		if (!enCours) verrou.current = false
	}, [enCours, etat])

	return (
		<form
			action={envoyer}
			onSubmit={evenement => {
				if (verrou.current) evenement.preventDefault()
				else verrou.current = true
			}}
			className="flex w-full max-w-sm flex-col gap-4 text-left"
		>
			<input type="hidden" name="callbackUrl" value={retour} />
			<label className="flex flex-col gap-1 font-medium text-sm" htmlFor="email">
				Adresse email
				<input
					id="email"
					name="email"
					type="email"
					autoComplete="email"
					required
					className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-normal text-base"
				/>
			</label>
			<label className="flex flex-col gap-1 font-medium text-sm" htmlFor="password">
				Mot de passe
				<input
					id="password"
					name="password"
					type="password"
					autoComplete="current-password"
					required
					className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-normal text-base"
				/>
			</label>
			<p className="text-right text-sm">
				<Link className="inline-flex min-h-11 items-center font-medium underline" href="/auth/mot-de-passe-oublie">
					Mot de passe oublié ?
				</Link>
			</p>
			<div role="alert" data-testid="erreur-connexion">
				{etat ? <p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">{messageErreur(etat.code)}</p> : null}
			</div>
			<button
				type="submit"
				disabled={enCours}
				aria-busy={enCours}
				className="min-h-11 rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:cursor-wait disabled:opacity-60"
			>
				{enCours ? 'Connexion…' : 'Se connecter'}
			</button>
		</form>
	)
}
