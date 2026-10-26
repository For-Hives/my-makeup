'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef } from 'react'
import { ART_FIELD, ART_LABEL, ART_LINK_BUTTON, ART_NOTICE, ART_SUBMIT } from '@/components/art/form-classes'
import { FORGOT_PASSWORD_PAGE, PASSWORD_MESSAGES, type PasswordResetFailureCode } from '@/lib/auth/forgot-password'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/sign-up'

export type PasswordResetState = { modifie: true } | { code: PasswordResetFailureCode } | null
export type PasswordResetAction = (precedent: PasswordResetState, formulaire: FormData) => Promise<PasswordResetState>

const FIELD = ART_FIELD

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
				<p role="status" data-testid="mot-de-passe-modifie" className={`max-w-sm ${ART_NOTICE.info}`}>
					{PASSWORD_MESSAGES.modifie}
				</p>
				<Link className={ART_LINK_BUTTON} href="/auth/signin">
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
				className="flex w-full max-w-sm flex-col gap-5 text-left"
			>
				<label className={ART_LABEL} htmlFor="password">
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
				<p id="aide-password" className="-mt-2 text-mute text-xs">
					{MIN_PASSWORD_LENGTH} caractères au moins.
				</p>
				<label className={ART_LABEL} htmlFor="password-confirmation">
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
					{code ? <p className={ART_NOTICE.error}>{PASSWORD_MESSAGES[code]}</p> : null}
				</div>
				{code === 'code-invalide' || code === 'code-absent' ? (
					<Link className={`${ART_LINK_BUTTON} w-full`} href={FORGOT_PASSWORD_PAGE}>
						Demander un nouveau lien
					</Link>
				) : (
					<button type="submit" disabled={inProgress} aria-busy={inProgress} className={ART_SUBMIT}>
						{inProgress ? 'Enregistrement…' : 'Enregistrer'}
					</button>
				)}
			</form>
		</>
	)
}
