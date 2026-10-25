'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef } from 'react'
import { ART_FIELD, ART_LABEL, ART_LINK, ART_NOTICE, ART_SUBMIT } from '@/components/art/form-classes'
import { type Track, track } from '@/lib/analytics/track'
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
	suivre?: Track
}) {
	const [state, send, inProgress] = useActionState(action, null)
	const lock = useRef(false)

	useEffect(() => {
		if (!inProgress) lock.current = false
	}, [inProgress, state])

	// A refusal is a new state each time, so each one is sent once (ticket 146). A success ends in a
	// redirection and never comes back here: the next page sends it (`SignInSucceeded`).
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
			className="flex w-full max-w-sm flex-col gap-5 text-left"
		>
			<input type="hidden" name="callbackUrl" value={retour} />
			<label className={ART_LABEL} htmlFor="email">
				Adresse email
				<input id="email" name="email" type="email" autoComplete="email" required className={ART_FIELD} />
			</label>
			<label className={ART_LABEL} htmlFor="password">
				Mot de passe
				<input
					id="password"
					name="password"
					type="password"
					autoComplete="current-password"
					required
					className={ART_FIELD}
				/>
			</label>
			<p className="text-right text-sm">
				<Link className={ART_LINK} href="/auth/mot-de-passe-oublie">
					Mot de passe oublié ?
				</Link>
			</p>
			<div role="alert" data-testid="erreur-connexion">
				{state ? <p className={ART_NOTICE.error}>{errorMessage(state.code)}</p> : null}
			</div>
			<button type="submit" disabled={inProgress} aria-busy={inProgress} className={ART_SUBMIT}>
				{inProgress ? 'Connexion…' : 'Se connecter'}
			</button>
		</form>
	)
}
