'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef } from 'react'
import { type Suivre, track } from '@/lib/analytics/track'
import { type ErrorCode, errorMessage } from '@/lib/auth/errors'

export type SignInState = { code: ErrorCode } | null
export type SignInAction = (precedent: SignInState, formulaire: FormData) => Promise<SignInState>

/**
 * The sign-in form. The error is a `role="alert"` under the form: it is announced by a screen
 * reader, and the address does not change. A key held down sends one request: React would queue
 * every submit, so the form refuses the next one until the first has answered.
 */
export function SignInForm({
	action,
	retour,
	suivre = track,
}: {
	action: SignInAction
	retour: string
	suivre?: Suivre
}) {
	const [state, send, inProgress] = useActionState(action, null)
	const lock = useRef(false)

	useEffect(() => {
		if (!inProgress) lock.current = false
	}, [inProgress, state])

	// A refusal is a new state each time, so each one is sent once (ticket 146). A success ends in a
	// redirection and never comes back here: the next page sends it (`ConnexionReussie`).
	useEffect(() => {
		if (state) suivre('login_result', { method: 'email', ok: false, code: state.code })
	}, [state, suivre])

	return (
		<form
			action={send}
			onSubmit={evenement => {
				if (lock.current) evenement.preventDefault()
				else lock.current = true
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
				{state ? <p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">{errorMessage(state.code)}</p> : null}
			</div>
			<button
				type="submit"
				disabled={inProgress}
				aria-busy={inProgress}
				className="min-h-11 rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:cursor-wait disabled:opacity-60"
			>
				{inProgress ? 'Connexion…' : 'Se connecter'}
			</button>
		</form>
	)
}
