'use client'

import { useActionState, useEffect, useRef } from 'react'
import { type Track, track } from '@/lib/analytics/track'
import {
	MIN_PASSWORD_LENGTH,
	SIGN_UP_FAILURE_MESSAGES,
	type SignUpErrors,
	type SignUpFailureCode,
	type SignUpField,
	TRAP_FIELD,
} from '@/lib/auth/sign-up'

export type SignUpState = {
	erreurs?: SignUpErrors
	echec?: SignUpFailureCode
	valeurs?: { nom: string; email: string; cgu: boolean }
} | null
export type SignUpAction = (precedent: SignUpState, formulaire: FormData) => Promise<SignUpState>

const FIELD =
	'rounded-md border border-neutral-300 bg-white px-3 py-2 font-normal text-base aria-[invalid=true]:border-red-600'

function FormError({ champ, erreurs: errors }: { champ: SignUpField; erreurs: SignUpErrors | undefined }) {
	const message = errors?.[champ]
	return (
		<p id={`erreur-${champ}`} className="text-red-800 text-sm" data-testid={`erreur-${champ}`}>
			{message}
		</p>
	)
}

const TOO_MANY_ATTEMPTS = SIGN_UP_FAILURE_MESSAGES['trop-de-tentatives']

/**
 * Past 5 sign-ups an hour, the proxy answers 429 with the sentence above as its body (ticket 084), and
 * the client script of Next throws that body as the message of the failed action. It is turned back
 * into the state of a refusal, so the form shows it under its fields instead of an error page.
 */
export function withProxyRefusal(action: SignUpAction): SignUpAction {
	return async (precedent, formulaire) => {
		try {
			return await action(precedent, formulaire)
		} catch (error) {
			if (!(error instanceof Error) || !error.message.includes(TOO_MANY_ATTEMPTS)) throw error
			const text = (cle: string) => {
				const value = formulaire.get(cle)
				return typeof value === 'string' ? value : ''
			}
			return {
				echec: 'trop-de-tentatives',
				valeurs: { nom: text('nom'), email: text('email'), cgu: formulaire.get('cgu') === 'on' },
			}
		}
	}
}

/**
 * The sign-up form (ticket 082). The page does not block the submit: the server checks the same
 * rules and answers one message per field, under the field, so that the wording is the same with or
 * without scripts. A key held down sends one request, as in the sign-in form.
 */
export function SignUpForm({ action, suivre = track }: { action: SignUpAction; suivre?: Track }) {
	const [state, send, inProgress] = useActionState(withProxyRefusal(action), null)
	const lock = useRef(false)
	const started = useRef(false)
	const errors = state?.erreurs

	useEffect(() => {
		if (!inProgress) lock.current = false
	}, [inProgress, state])

	// A refused sign-up is an authentication error, once per answer (ticket 146).
	useEffect(() => {
		if (state?.echec) suivre('auth_error', { code: state.echec })
	}, [state, suivre])

	const properties = (champ: SignUpField) => ({
		'aria-invalid': errors?.[champ] ? (true as const) : undefined,
		'aria-describedby': errors?.[champ] ? `erreur-${champ}` : undefined,
	})

	return (
		<form
			action={send}
			noValidate
			onSubmit={evenement => {
				if (lock.current) evenement.preventDefault()
				else {
					lock.current = true
					// The start of a sign-up: the first send of this visit, not each retry after a typo.
					if (!started.current) suivre('signup_start', { method: 'email' })
					started.current = true
				}
			}}
			className="flex w-full max-w-sm flex-col gap-4 text-left"
		>
			<label className="flex flex-col gap-1 font-medium text-sm" htmlFor="nom">
				Nom
				<input
					id="nom"
					name="nom"
					type="text"
					autoComplete="name"
					defaultValue={state?.valeurs?.nom}
					className={FIELD}
					{...properties('nom')}
				/>
			</label>
			<FormError champ="nom" erreurs={errors} />
			<label className="flex flex-col gap-1 font-medium text-sm" htmlFor="email">
				Adresse email
				<input
					id="email"
					name="email"
					type="email"
					inputMode="email"
					autoComplete="email"
					defaultValue={state?.valeurs?.email}
					className={FIELD}
					{...properties('email')}
				/>
			</label>
			<FormError champ="email" erreurs={errors} />
			<label className="flex flex-col gap-1 font-medium text-sm" htmlFor="password">
				Mot de passe
				<input
					id="password"
					name="password"
					type="password"
					autoComplete="new-password"
					className={FIELD}
					aria-describedby={errors?.password ? 'erreur-password aide-password' : 'aide-password'}
					aria-invalid={errors?.password ? true : undefined}
				/>
			</label>
			<p id="aide-password" className="-mt-2 text-neutral-600 text-xs">
				{MIN_PASSWORD_LENGTH} caractères au moins.
			</p>
			<FormError champ="password" erreurs={errors} />
			<label className="flex items-start gap-2 text-sm" htmlFor="cgu">
				<input
					id="cgu"
					name="cgu"
					type="checkbox"
					defaultChecked={state?.valeurs?.cgu}
					className="mt-1 h-4 w-4"
					{...properties('cgu')}
				/>
				<span>
					J’accepte les {/* A plain link: it opens in another tab, so the form she is filling stays as it is. */}
					<a href="/cgu" className="underline" target="_blank" rel="noopener">
						conditions générales
					</a>
					.
				</span>
			</label>
			<FormError champ="cgu" erreurs={errors} />
			{/* The trap (ticket 084): out of sight and of the tab order, and hidden from screen readers. A person never fills it. */}
			<div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
				<label htmlFor={TRAP_FIELD}>
					Laisse ce champ vide
					<input id={TRAP_FIELD} name={TRAP_FIELD} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
				</label>
			</div>
			<div role="alert" data-testid="erreur-inscription">
				{state?.echec ? (
					<p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">{SIGN_UP_FAILURE_MESSAGES[state.echec]}</p>
				) : null}
			</div>
			<button
				type="submit"
				disabled={inProgress}
				aria-busy={inProgress}
				className="min-h-11 rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:cursor-wait disabled:opacity-60"
			>
				{inProgress ? 'Inscription…' : 'S’inscrire'}
			</button>
		</form>
	)
}
