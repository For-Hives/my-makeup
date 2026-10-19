'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef } from 'react'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/sign-up'
import {
	type PasswordResetFailureCode,
	PASSWORD_MESSAGES,
	FORGOT_PASSWORD_PAGE,
} from '@/lib/auth/forgot-password'

export type PasswordResetState = { modifie: true } | { code: PasswordResetFailureCode } | null
export type PasswordResetAction = (
	precedent: PasswordResetState,
	formulaire: FormData
) => Promise<PasswordResetState>

const FIELD = 'rounded-md border border-neutral-300 bg-white px-3 py-2 font-normal text-base'

/** The second step: the new password twice. The code is not in the form; the server reads it from the cookie of the link. */
export function PasswordResetForm({ action }: { action: PasswordResetAction }) {
	const [state, send, inProgress] = useActionState(action, null)
	const lock = useRef(false)

	useEffect(() => {
		if (!inProgress) lock.current = false
	}, [inProgress, state])

	if (state && 'modifie' in state)
		return (
			<>
				<p
					role="status"
					data-testid="mot-de-passe-modifie"
					className="max-w-sm rounded-md bg-indigo-50 p-3 text-indigo-900 text-sm"
				>
					{PASSWORD_MESSAGES.modifie}
				</p>
				<Link
					className="inline-flex min-h-11 items-center rounded-md bg-neutral-900 px-4 py-2 font-medium text-white"
					href="/auth/signin"
				>
					Me connecter
				</Link>
			</>
		)

	const code = state && 'code' in state ? state.code : null
	return (
		<>
			<form
				action={send}
				noValidate
				onSubmit={evenement => {
					if (lock.current) evenement.preventDefault()
					else lock.current = true
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
						className={FIELD}
					/>
				</label>
				<p id="aide-password" className="-mt-2 text-neutral-600 text-xs">
					{MIN_PASSWORD_LENGTH} caractères au moins.
				</p>
				<label className="flex flex-col gap-1 font-medium text-sm" htmlFor="password-confirmation">
					Confirme le mot de passe
					<input
						id="password-confirmation"
						name="password-confirmation"
						type="password"
						autoComplete="new-password"
						required
						className={FIELD}
					/>
				</label>
				<div role="alert" data-testid="erreur-reinitialisation">
					{code ? <p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">{PASSWORD_MESSAGES[code]}</p> : null}
				</div>
				{code === 'code-invalide' || code === 'code-absent' ? (
					<Link
						className="inline-flex min-h-11 items-center justify-center rounded-md bg-neutral-900 px-4 py-2 font-medium text-white"
						href={FORGOT_PASSWORD_PAGE}
					>
						Demander un nouveau lien
					</Link>
				) : (
					<button
						type="submit"
						disabled={inProgress}
						aria-busy={inProgress}
						className="min-h-11 rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:cursor-wait disabled:opacity-60"
					>
						{inProgress ? 'Enregistrement…' : 'Enregistrer'}
					</button>
				)}
			</form>
		</>
	)
}
