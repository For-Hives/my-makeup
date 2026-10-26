'use client'

import { useActionState, useEffect, useRef } from 'react'
import { ART_FIELD, ART_LABEL, ART_NOTICE, ART_SUBMIT } from '@/components/art/form-classes'
import { type ForgotPasswordFailureCode, PASSWORD_MESSAGES } from '@/lib/auth/forgot-password'

export type ForgotPasswordState = { envoyee: true } | { code: ForgotPasswordFailureCode } | null
export type ForgotPasswordAction = (
	precedent: ForgotPasswordState,
	formulaire: FormData
) => Promise<ForgotPasswordState>

/**
 * The first step of the forgotten password. Once sent, the form gives way to the one sentence the
 * site always answers: it says nothing about the address. A key held down sends one request, as in
 * the sign-in form.
 */
export function ForgotPasswordForm({ action }: { action: ForgotPasswordAction }) {
	const [state, send, inProgress] = useActionState(action, null)
	const lock = useRef(false)

	useEffect(() => {
		if (!inProgress) lock.current = false
	}, [inProgress, state])

	if (state && 'envoyee' in state)
		return (
			<p role="status" data-testid="oubli-envoye" className={`max-w-sm ${ART_NOTICE.info}`}>
				{PASSWORD_MESSAGES.envoyee}
			</p>
		)

	return (
		<form
			action={send}
			noValidate
			onSubmit={evenement => {
				if (lock.current) evenement.preventDefault()
				else lock.current = true
			}}
			className="flex w-full max-w-sm flex-col gap-5 text-left"
		>
			<p className="text-mute text-sm">
				Indique l’adresse email de ton compte : tu recevras un lien pour choisir un nouveau mot de passe.
			</p>
			<label className={ART_LABEL} htmlFor="email">
				Adresse email
				<input
					id="email"
					name="email"
					type="email"
					inputMode="email"
					autoComplete="email"
					required
					className={ART_FIELD}
				/>
			</label>
			<div role="alert" data-testid="erreur-oubli">
				{state && 'code' in state ? <p className={ART_NOTICE.error}>{PASSWORD_MESSAGES[state.code]}</p> : null}
			</div>
			<button type="submit" disabled={inProgress} aria-busy={inProgress} className={ART_SUBMIT}>
				{inProgress ? 'Envoi…' : 'Recevoir un lien'}
			</button>
		</form>
	)
}
