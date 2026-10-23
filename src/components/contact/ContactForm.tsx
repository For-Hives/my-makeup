'use client'

import { type ReactNode, useActionState, useEffect, useMemo, useRef } from 'react'
import { track } from '@/lib/analytics/track'
import {
	CONTACT_TRAP_FIELD,
	type ContactField,
	type ContactState,
	ERRORS_SUMMARY,
	MESSAGE_NOT_SAVED,
	MESSAGE_SENT,
	MESSAGE_TOO_MANY_MESSAGES,
	MESSAGE_VERIFICATION_FAILED,
} from '@/lib/contact/message'
import { TurnstileWidget } from './TurnstileWidget'

export type ContactAction = (precedent: ContactState, formulaire: FormData) => Promise<ContactState>

/** What the form needs of the measure: `track`, and a double in a test. */
export type TrackContact = (nom: 'platform_contact_submit', proprietes: { ok: boolean; status: number }) => unknown

const FIELD =
	'block w-full rounded-md border-0 px-3.5 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-red-600 sm:text-sm sm:leading-6'

const LABELS: Record<ContactField, string> = {
	prenom: 'Prénom',
	nom: 'Nom',
	email: 'Email',
	telephone: 'Numéro de téléphone (facultatif)',
	message: 'Message',
}

/** The outcome of one send, as the event counts it: stored or not, and an HTTP-like status. Never what was typed. */
function issue(etat: Exclude<ContactState, null>): { ok: boolean; status: number } {
	if ('envoye' in etat) return { ok: true, status: 200 }
	if ('erreurs' in etat) return { ok: false, status: 400 }
	if ('limite' in etat) return { ok: false, status: 429 }
	if ('verification' in etat) return { ok: false, status: 403 }
	return { ok: false, status: etat.reseau ? 0 : 500 }
}

/**
 * A request that fails on the way (the network, a proxy) throws in the client script of Next: it is turned
 * into the state of a failure, so that the form keeps what she typed and says so.
 */
export function withNetworkFailure(action: ContactAction): ContactAction {
	return async (precedent, formulaire) => {
		try {
			return await action(precedent, formulaire)
		} catch (error) {
			// The proxy's 429 (ticket 161) comes back as the message of the failed action.
			const limited = error instanceof Error && error.message.includes(MESSAGE_TOO_MANY_MESSAGES)
			const text = (cle: ContactField) => {
				const value = formulaire.get(cle)
				return typeof value === 'string' ? value : ''
			}
			const values = {
				prenom: text('prenom'),
				nom: text('nom'),
				email: text('email'),
				telephone: text('telephone'),
				message: text('message'),
			}
			return limited ? { limite: true, valeurs: values } : { echec: true, reseau: true, valeurs: values }
		}
	}
}

/** One field: its label, the control, and the sentence of its error. */
function Field({
	champ,
	large = true,
	erreur: error,
	children,
}: {
	champ: ContactField
	large?: boolean
	erreur: string | undefined
	children: ReactNode
}) {
	return (
		<div className={large ? 'sm:col-span-2' : undefined}>
			<label htmlFor={champ} className="block font-semibold text-gray-900 text-sm leading-6">
				{LABELS[champ]}
			</label>
			<div className="mt-2.5">
				{children}
				<p id={`erreur-${champ}`} data-testid={`erreur-${champ}`} className="mt-2 text-red-700 text-xs">
					{error}
				</p>
			</div>
		</div>
	)
}

/**
 * The contact form (ticket 158; tickets 159 and 160 for what it does when it fails).
 *
 * - The page does not block the submit: the server checks the same rules and answers one sentence per
 *   field, shown under the field, so that the wording is the same with or without scripts.
 * - On an error, the focus goes to the first field in error and the summary is announced. Each field
 *   points to its sentence (`aria-describedby`) and is marked invalid.
 * - A double click or an Enter held down sends one message: the form refuses a second submit until the
 *   answer is there, and the button is off meanwhile. Once sent, the form gives way to the confirmation.
 * - After a failure, what she typed stays in the fields. React empties a form once its action has
 *   answered, so the fields are remounted with each answer and take her typing back as their value.
 * - The event of the measure is sent once for each answer.
 */
export function ContactForm({
	action,
	suivre = track,
	siteKey,
}: {
	action: ContactAction
	suivre?: TrackContact
	/** The public key of the Turnstile widget (ticket 1000). Without it, no widget. */
	siteKey?: string
}) {
	const [state, submit, pending] = useActionState(withNetworkFailure(action), null)
	const lock = useRef(false)
	const form = useRef<HTMLFormElement>(null)
	const count = useRef<ContactState>(null)
	const generations = useRef(0)
	const errors = state && 'erreurs' in state ? state.erreurs : undefined
	// A new number for each answer: the fields are remounted, and take her typing back as their value.
	const generation = useMemo(() => ++generations.current, [state])

	useEffect(() => {
		if (!pending) lock.current = false
	}, [pending, state])

	// Once for each answer, never for a render.
	useEffect(() => {
		if (state === null || count.current === state) return
		count.current = state
		suivre('platform_contact_submit', issue(state))
	}, [state, suivre])

	// The first field in error takes the focus, once the fields are remounted.
	useEffect(() => {
		if (errors) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
	}, [errors])

	if (state && 'envoye' in state)
		return (
			<p
				role="status"
				data-testid="contact-envoye"
				className="mx-auto my-32 max-w-xl rounded-md bg-green-50 p-4 text-center font-semibold text-green-900 text-sm"
			>
				{MESSAGE_SENT}
			</p>
		)

	const values = state && 'valeurs' in state ? state.valeurs : undefined
	const properties = (champ: ContactField) => ({
		id: champ,
		name: champ,
		defaultValue: values?.[champ],
		'aria-invalid': errors?.[champ] ? (true as const) : undefined,
		'aria-describedby': errors?.[champ] ? `erreur-${champ}` : undefined,
		className: FIELD,
	})

	return (
		<form
			ref={form}
			action={submit}
			noValidate
			onSubmit={evenement => {
				if (lock.current) evenement.preventDefault()
				else lock.current = true
			}}
			className="relative mx-auto my-32 max-w-xl px-4 sm:mt-20 md:px-0"
		>
			<div key={generation} className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
				<Field champ="prenom" large={false} erreur={errors?.prenom}>
					<input type="text" autoComplete="given-name" {...properties('prenom')} />
				</Field>
				<Field champ="nom" large={false} erreur={errors?.nom}>
					<input type="text" autoComplete="family-name" {...properties('nom')} />
				</Field>
				<Field champ="email" erreur={errors?.email}>
					<input type="email" inputMode="email" autoComplete="email" {...properties('email')} />
				</Field>
				<Field champ="telephone" erreur={errors?.telephone}>
					<input type="tel" inputMode="tel" autoComplete="tel" {...properties('telephone')} />
				</Field>
				<Field champ="message" erreur={errors?.message}>
					<textarea rows={4} {...properties('message')} />
				</Field>
				<div className="sm:col-span-2">
					<p className="text-gray-600 text-sm leading-6">
						En envoyant votre message, vous acceptez notre{' '}
						<a href="/politique-de-confidentialite" className="font-semibold">
							politique&nbsp;de&nbsp;confidentialité.
						</a>
					</p>
				</div>
			</div>
			{/* The trap (ticket 161): out of sight and of the tab order, and hidden from screen readers. A person never fills it. */}
			<div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
				<label htmlFor={CONTACT_TRAP_FIELD}>
					Laissez ce champ vide
					<input
						id={CONTACT_TRAP_FIELD}
						name={CONTACT_TRAP_FIELD}
						type="text"
						tabIndex={-1}
						autoComplete="off"
						defaultValue=""
					/>
				</label>
			</div>
			{siteKey ? <TurnstileWidget siteKey={siteKey} answer={generation} /> : null}
			<div role="alert" data-testid="erreur-contact" className="mt-6 empty:hidden">
				{errors ? <p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">{ERRORS_SUMMARY}</p> : null}
				{state && 'echec' in state ? (
					<p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">{MESSAGE_NOT_SAVED}</p>
				) : null}
				{state && 'verification' in state ? (
					<p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">{MESSAGE_VERIFICATION_FAILED}</p>
				) : null}
				{state && 'limite' in state ? (
					<p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">{MESSAGE_TOO_MANY_MESSAGES}</p>
				) : null}
			</div>
			<div className="mt-10">
				<button
					type="submit"
					disabled={pending}
					aria-busy={pending}
					className="block w-full rounded-md bg-indigo-900 px-3.5 py-2.5 text-center font-semibold text-sm text-white shadow-sm hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-900 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60"
				>
					{pending ? 'Envoi…' : 'Envoyer l’email'}
				</button>
			</div>
		</form>
	)
}
