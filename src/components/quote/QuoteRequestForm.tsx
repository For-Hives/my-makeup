'use client'

import { type ReactNode, useActionState, useEffect, useMemo, useRef } from 'react'
import { ART_FIELD, ART_NOTICE, ART_SUBMIT } from '@/components/art/form-classes'
import { TurnstileWidget } from '@/components/contact/TurnstileWidget'
import type { MyMakeupEvents, Pid } from '@/lib/analytics/events'
import { profileVisitCounts } from '@/lib/analytics/my-pid'
import { track } from '@/lib/analytics/track'
import {
	QUOTE_ERRORS_SUMMARY,
	QUOTE_LIMITS,
	QUOTE_NOT_SAVED,
	QUOTE_SENT,
	QUOTE_THROTTLED,
	QUOTE_TRAP_FIELD,
	QUOTE_UNAVAILABLE,
	QUOTE_VERIFICATION_FAILED,
	type QuoteField,
	type QuoteState,
	quoteFormValues,
	SERVICE_TYPE_LABELS,
	SERVICE_TYPES,
} from '@/lib/quote/request'

export type QuoteAction = (previous: QuoteState, form: FormData) => Promise<QuoteState>

/**
 * A request that fails on the way (the network, a proxy) throws in the client script of Next: it is turned into
 * the state of a failure, so that the form keeps what she typed and says so.
 */
export function withNetworkFailure(action: QuoteAction): QuoteAction {
	return async (previous, form) => {
		try {
			return await action(previous, form)
		} catch {
			return { failure: true, values: quoteFormValues(form) }
		}
	}
}

const FIELD = ART_FIELD

/** Why a request did not go through, as the measure words it (never what was typed). */
function errorCause(state: NonNullable<QuoteState>): MyMakeupEvents['quote_error']['cause'] {
	if ('errors' in state) return 'validation'
	if ('throttled' in state) return 'trop_de_demandes'
	if ('verification' in state) return 'verification'
	if ('unavailable' in state) return 'indisponible'
	return 'echec'
}

const LABELS: Record<Exclude<QuoteField, 'consent'>, string> = {
	eventDate: 'Date de l’événement',
	serviceType: 'Type de prestation',
	place: 'Lieu de l’événement',
	message: 'Votre message',
	firstName: 'Votre prénom',
	email: 'Votre email',
	phone: 'Votre téléphone (facultatif)',
}

/** The id of a field: prefixed, so that two forms or a field of the page never share one. */
const idOf = (field: QuoteField): string => `devis-${field}`

function Field({
	field,
	error,
	children,
	wide = true,
}: {
	field: Exclude<QuoteField, 'consent'>
	error: string | undefined
	children: ReactNode
	wide?: boolean
}) {
	return (
		<div className={wide ? 'sm:col-span-2' : undefined}>
			<label htmlFor={idOf(field)} className="block font-semibold text-gray-900 text-sm leading-6">
				{LABELS[field]}
			</label>
			<div className="mt-2">
				{children}
				<p
					id={`erreur-${idOf(field)}`}
					data-testid={`erreur-${idOf(field)}`}
					className="mt-2 text-red-700 text-xs empty:hidden"
				>
					{error}
				</p>
			</div>
		</div>
	)
}

/**
 * The quote request form of a profile (issue 1003), in « vous ». It sits on the public page of the profile,
 * which is kept in the cache: it knows nothing of the artist or of the visitor, only the slug it sends back.
 *
 * - The server checks the same rules and answers one sentence per field, shown under the field; each field
 *   points to its sentence and is marked invalid; the first one in error takes the focus.
 * - The consent is a box to tick, with the link to the privacy policy; the request is not sent without it.
 * - A double click sends one request: the form refuses a second submit until the answer is there.
 * - What she typed stays in the fields after a failure. React empties a form once its action has answered, so
 *   the fields are remounted with each answer and take her typing back as their value.
 * - Every target is 44 px high. A trap field and the Turnstile widget keep the robots out, as on the contact form.
 * - The audience measure (27/10/2026) follows the request from its start to its end: `devis_click` at the first field she
 *   touches, `quote_submit` when she sends it, then `demande_envoyee` or `quote_error` with the cause. Nothing typed
 *   leaves, and the artist herself is not counted (`profileVisitCounts`). The form is given the `pid` of the profile,
 *   which is public; the slug never goes into an event.
 */
export function QuoteRequestForm({
	action,
	slug,
	pid,
	siteKey,
}: {
	action: QuoteAction
	/** The slug of the profile the form is on. */
	slug: string
	/** The id the measure counts the profile under; none, nothing is measured. */
	pid: Pid | null
	/** The public key of the Turnstile widget. Without it, no widget. */
	siteKey?: string
}) {
	const [state, submit, pending] = useActionState(withNetworkFailure(action), null)
	const lock = useRef(false)
	const form = useRef<HTMLFormElement>(null)
	const generations = useRef(0)
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new number for each answer, whatever the answer is
	const generation = useMemo(() => ++generations.current, [state])
	const errors = state && 'errors' in state ? state.errors : undefined
	const values = state && 'values' in state ? state.values : undefined

	useEffect(() => {
		if (!pending) lock.current = false
	}, [pending, state])

	// The steps of the request for the measure, once for each answer of the server.
	const started = useRef(false)
	useEffect(() => {
		if (state === null || pid === null) return
		const event = () => {
			if ('sent' in state) track('demande_envoyee', { pid, source: 'profil' })
			else track('quote_error', { pid, cause: errorCause(state) })
		}
		void profileVisitCounts(pid).then(counts => {
			if (counts) event()
		})
	}, [state, pid])

	// The first field in error takes the focus, once the fields are remounted.
	useEffect(() => {
		if (errors) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
	}, [errors])

	if (state && 'sent' in state)
		return (
			<p role="status" data-testid="devis-envoye" className={`${ART_NOTICE.success} font-semibold`}>
				{QUOTE_SENT}
			</p>
		)
	if (state && 'unavailable' in state)
		return (
			<p role="status" data-testid="devis-indisponible" className={ART_NOTICE.soft}>
				{QUOTE_UNAVAILABLE}
			</p>
		)

	const properties = (field: Exclude<QuoteField, 'consent'>) => ({
		id: idOf(field),
		name: field,
		defaultValue: values?.[field],
		'aria-invalid': errors?.[field] ? (true as const) : undefined,
		'aria-describedby': errors?.[field] ? `erreur-${idOf(field)}` : undefined,
		className: FIELD,
	})

	return (
		<form
			ref={form}
			action={submit}
			noValidate
			data-testid="devis-formulaire"
			onFocus={() => {
				if (started.current || pid === null) return
				started.current = true
				void profileVisitCounts(pid).then(counts => {
					if (counts) track('devis_click', { pid, from: 'profil' })
				})
			}}
			onSubmit={event => {
				if (lock.current) {
					event.preventDefault()
					return
				}
				lock.current = true
				if (pid !== null)
					void profileVisitCounts(pid).then(counts => {
						if (counts) track('quote_submit', { pid })
					})
			}}
			className="relative"
		>
			<input type="hidden" name="profile" value={slug} />
			<div key={generation} className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
				<Field field="eventDate" error={errors?.eventDate} wide={false}>
					<input type="date" {...properties('eventDate')} />
				</Field>
				<Field field="serviceType" error={errors?.serviceType} wide={false}>
					<select {...properties('serviceType')} defaultValue={values?.serviceType ?? ''}>
						<option value="" disabled>
							Choisir…
						</option>
						{SERVICE_TYPES.map(type => (
							<option key={type} value={type}>
								{SERVICE_TYPE_LABELS[type]}
							</option>
						))}
					</select>
				</Field>
				<Field field="place" error={errors?.place}>
					<input type="text" maxLength={QUOTE_LIMITS.place} autoComplete="off" {...properties('place')} />
				</Field>
				<Field field="message" error={errors?.message}>
					<textarea rows={4} maxLength={QUOTE_LIMITS.message} {...properties('message')} />
				</Field>
				<Field field="firstName" error={errors?.firstName} wide={false}>
					<input
						type="text"
						autoComplete="given-name"
						maxLength={QUOTE_LIMITS.firstName}
						{...properties('firstName')}
					/>
				</Field>
				<Field field="email" error={errors?.email} wide={false}>
					<input type="email" inputMode="email" autoComplete="email" {...properties('email')} />
				</Field>
				<Field field="phone" error={errors?.phone}>
					<input
						type="tel"
						inputMode="tel"
						autoComplete="tel"
						maxLength={QUOTE_LIMITS.phone}
						{...properties('phone')}
					/>
				</Field>
				<div className="sm:col-span-2">
					<label
						htmlFor={idOf('consent')}
						className="flex min-h-11 items-start gap-3 py-2 text-gray-800 text-sm leading-6"
					>
						<input
							id={idOf('consent')}
							name="consent"
							type="checkbox"
							aria-invalid={errors?.consent ? true : undefined}
							aria-describedby={errors?.consent ? `erreur-${idOf('consent')}` : undefined}
							className="mt-0.5 h-6 w-6 shrink-0 rounded border-gray-400 text-indigo-700 focus:ring-indigo-600"
						/>
						<span>
							J’accepte que ma demande, avec mon prénom, mon email et mon éventuel téléphone, soit transmise à cette
							maquilleuse, et conservée 6 mois (
							<a href="/politique-de-confidentialite" className="font-semibold underline">
								politique&nbsp;de&nbsp;confidentialité
							</a>
							).
						</span>
					</label>
					<p
						id={`erreur-${idOf('consent')}`}
						data-testid={`erreur-${idOf('consent')}`}
						className="text-red-700 text-xs empty:hidden"
					>
						{errors?.consent}
					</p>
				</div>
			</div>
			{/* The trap: out of sight and of the tab order, and hidden from screen readers. A person never fills it. */}
			<div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
				<label htmlFor={QUOTE_TRAP_FIELD}>
					Laissez ce champ vide
					<input
						id={QUOTE_TRAP_FIELD}
						name={QUOTE_TRAP_FIELD}
						type="text"
						tabIndex={-1}
						autoComplete="off"
						defaultValue=""
					/>
				</label>
			</div>
			{siteKey ? <TurnstileWidget siteKey={siteKey} answer={generation} /> : null}
			<div role="alert" data-testid="devis-erreur" className="mt-5 empty:hidden">
				{errors ? <p className={ART_NOTICE.error}>{QUOTE_ERRORS_SUMMARY}</p> : null}
				{state && 'failure' in state ? <p className={ART_NOTICE.error}>{QUOTE_NOT_SAVED}</p> : null}
				{state && 'verification' in state ? <p className={ART_NOTICE.error}>{QUOTE_VERIFICATION_FAILED}</p> : null}
				{state && 'throttled' in state ? <p className={ART_NOTICE.error}>{QUOTE_THROTTLED}</p> : null}
			</div>
			<div className="mt-6">
				<button type="submit" disabled={pending} aria-busy={pending} className={`${ART_SUBMIT} sm:w-auto`}>
					{pending ? 'Envoi…' : 'Envoyer ma demande'}
				</button>
			</div>
		</form>
	)
}
