'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef } from 'react'
import { MOT_DE_PASSE_MIN } from '@/lib/auth/sign-up'
import {
	type CodeEchecDeLaReinitialisation,
	MESSAGES_MOT_DE_PASSE,
	PAGE_DE_LA_DEMANDE,
} from '@/lib/auth/forgot-password'

export type EtatDeLaReinitialisation = { modifie: true } | { code: CodeEchecDeLaReinitialisation } | null
export type ActionDeLaReinitialisation = (
	precedent: EtatDeLaReinitialisation,
	formulaire: FormData
) => Promise<EtatDeLaReinitialisation>

const CHAMP = 'rounded-md border border-neutral-300 bg-white px-3 py-2 font-normal text-base'

/** The second step: the new password twice. The code is not in the form; the server reads it from the cookie of the link. */
export function FormulaireDeReinitialisation({ action }: { action: ActionDeLaReinitialisation }) {
	const [etat, envoyer, enCours] = useActionState(action, null)
	const verrou = useRef(false)

	useEffect(() => {
		if (!enCours) verrou.current = false
	}, [enCours, etat])

	if (etat && 'modifie' in etat)
		return (
			<>
				<p
					role="status"
					data-testid="mot-de-passe-modifie"
					className="max-w-sm rounded-md bg-indigo-50 p-3 text-indigo-900 text-sm"
				>
					{MESSAGES_MOT_DE_PASSE.modifie}
				</p>
				<Link
					className="inline-flex min-h-11 items-center rounded-md bg-neutral-900 px-4 py-2 font-medium text-white"
					href="/auth/signin"
				>
					Me connecter
				</Link>
			</>
		)

	const code = etat && 'code' in etat ? etat.code : null
	return (
		<>
			<form
				action={envoyer}
				noValidate
				onSubmit={evenement => {
					if (verrou.current) evenement.preventDefault()
					else verrou.current = true
				}}
				className="flex w-full max-w-sm flex-col gap-4 text-left"
			>
				<label className="flex flex-col gap-1 font-medium text-sm" htmlFor="password">
					Nouveau mot de passe
					<input
						id="password"
						name="password"
						type="password"
						autoComplete="new-password"
						required
						aria-describedby="aide-password"
						className={CHAMP}
					/>
				</label>
				<p id="aide-password" className="-mt-2 text-neutral-600 text-xs">
					{MOT_DE_PASSE_MIN} caractères au moins.
				</p>
				<label className="flex flex-col gap-1 font-medium text-sm" htmlFor="password-confirmation">
					Confirme le mot de passe
					<input
						id="password-confirmation"
						name="password-confirmation"
						type="password"
						autoComplete="new-password"
						required
						className={CHAMP}
					/>
				</label>
				<div role="alert" data-testid="erreur-reinitialisation">
					{code ? <p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">{MESSAGES_MOT_DE_PASSE[code]}</p> : null}
				</div>
				{code === 'code-invalide' || code === 'code-absent' ? (
					<Link
						className="inline-flex min-h-11 items-center justify-center rounded-md bg-neutral-900 px-4 py-2 font-medium text-white"
						href={PAGE_DE_LA_DEMANDE}
					>
						Demander un nouveau lien
					</Link>
				) : (
					<button
						type="submit"
						disabled={enCours}
						aria-busy={enCours}
						className="min-h-11 rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:cursor-wait disabled:opacity-60"
					>
						{enCours ? 'Enregistrement…' : 'Enregistrer'}
					</button>
				)}
			</form>
		</>
	)
}
