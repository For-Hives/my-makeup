'use client'

import type { ReactNode } from 'react'
import { type Resolver, useForm } from 'react-hook-form'
import { BlockForm, FIELD_CLASS } from '@/components/direct-edit/BlockForm'
import type { ContactsSave } from '@/components/direct-edit/blocks/ContactsBlock'
import type { NetworksSave } from '@/components/direct-edit/blocks/NetworksBlock'
import { trackSave } from '@/lib/dashboard/analytics'
import type { ContactDetailsValues } from '@/lib/dashboard/contact-details'
import { type ContactStepField, type ContactStepValues, readContactStep } from '@/lib/dashboard/contact-step'
import { NETWORKS, type NetworksValues, normalizeNetwork } from '@/lib/dashboard/networks'
import { FAILURE_MESSAGE, type SaveResult } from '@/lib/dashboard/result'
import type { BlockOutcome } from '@/lib/direct-edit/save-state'
import { readableLabel } from '@/lib/profile/public-view'

const FIELDS: readonly ContactStepField[] = ['instagram', 'telephone', 'email', 'contactPublic']

/**
 * The fourth step, « Comment te joindre » (issue 1009): Instagram first, then a phone or an email with
 * the same choice as her space and her page (« Afficher mon téléphone et mon email sur ma page », off
 * until she ticks it). The fields, the rules and the two saves are those of the networks and contact
 * blocks of the direct edition; what is sent is decided by `readContactStep`, so the other networks she
 * has stay, and a part she did not touch is not sent.
 */
export function ContactStep({
	networks,
	contact,
	saveNetworks,
	saveContacts,
	cancel,
}: {
	networks: NetworksValues
	contact: ContactDetailsValues
	saveNetworks: NetworksSave
	saveContacts: ContactsSave
	cancel: ReactNode
}) {
	const stored = { networks, contact }
	const resolver: Resolver<ContactStepValues> = values => {
		const read = readContactStep(values, stored)
		if (read.ok === false)
			return {
				values: {},
				errors: Object.fromEntries(
					FIELDS.flatMap(field => {
						const message = read.champs[field]
						return message === undefined ? [] : [[field, { type: 'validate', message }]]
					})
				),
			}
		return { values, errors: {} }
	}
	const {
		register,
		handleSubmit,
		setError,
		watch,
		formState: { errors, isDirty },
	} = useForm<ContactStepValues>({
		resolver,
		defaultValues: {
			instagram: networks.instagram,
			telephone: contact.telephone,
			email: contact.email,
			contactPublic: contact.contactPublic,
		},
	})
	const typed = watch()
	const reading = normalizeNetwork('instagram', typed.instagram)
	const shown = reading.ok && reading.valeur !== '' ? readableLabel('instagram', reading.valeur, reading.valeur) : ''

	/** Saves what changed: the networks first, the contact details next. The first refusal stops it. */
	async function send(input: ContactStepValues): Promise<BlockOutcome | null> {
		const read = readContactStep(input, stored)
		if (read.ok === false) return null
		if (read.ok === 'empty') return { ok: false, message: read.message }
		let last: BlockOutcome = { ok: true }
		if (read.networks !== null) {
			last = await saveNetworks(read.networks).catch(
				(): SaveResult<NetworksValues> => ({ ok: false, message: FAILURE_MESSAGE })
			)
			trackSave('reseaux', last)
			if (!last.ok) return last
		}
		if (read.contact !== null) {
			last = await saveContacts(read.contact).catch((): SaveResult<never> => ({ ok: false, message: FAILURE_MESSAGE }))
			trackSave('coordonnees', last)
			if (!last.ok) return last
		}
		return { ok: true }
	}

	const instagramError = errors.instagram?.message
	const phoneError = errors.telephone?.message
	const emailError = errors.email?.message
	const choiceError = errors.contactPublic?.message
	return (
		<BlockForm
			title="Comment te joindre"
			dirty={isDirty}
			submitLabel="Suivant"
			cancel={cancel}
			keepsHint="ta saisie est toujours là"
			onFailure={failure => {
				for (const field of FIELDS) {
					const text = failure.fields?.[field] ?? (field === 'instagram' ? failure.fields?.instagram : undefined)
					if (text) setError(field, { message: text })
				}
			}}
			onSend={() =>
				new Promise(resolve => {
					// Refused in the browser: the message is under the field and nothing is sent.
					void handleSubmit(
						async input => resolve(await send(input)),
						() => resolve(null)
					)()
				})
			}
		>
			<div className="flex flex-col gap-1">
				<label htmlFor="accueil-instagram" className="font-medium text-sm">
					{NETWORKS.instagram.libelle}
				</label>
				<input
					id="accueil-instagram"
					type="text"
					autoComplete="off"
					autoCapitalize="none"
					spellCheck={false}
					placeholder={NETWORKS.instagram.exemple}
					aria-invalid={instagramError ? true : undefined}
					aria-describedby={`accueil-instagram-help${instagramError ? ' accueil-instagram-error' : ''}`}
					className={FIELD_CLASS}
					{...register('instagram')}
				/>
				<p id="accueil-instagram-help" className="min-h-5 text-mute text-sm">
					{shown ? `Sur ta page : ${shown}` : 'Ton @pseudo suffit.'}
				</p>
				{instagramError ? (
					<p id="accueil-instagram-error" className="text-lipstick-800 text-sm">
						{instagramError}
					</p>
				) : null}
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1">
					<label htmlFor="accueil-telephone" className="font-medium text-sm">
						Téléphone
					</label>
					<input
						id="accueil-telephone"
						type="tel"
						autoComplete="off"
						aria-invalid={phoneError ? true : undefined}
						aria-describedby={phoneError ? 'accueil-telephone-error' : undefined}
						className={FIELD_CLASS}
						{...register('telephone')}
					/>
					{phoneError ? (
						<p id="accueil-telephone-error" className="text-lipstick-800 text-sm">
							{phoneError}
						</p>
					) : null}
				</div>
				<div className="flex flex-col gap-1">
					<label htmlFor="accueil-email" className="font-medium text-sm">
						Email de contact
					</label>
					<input
						id="accueil-email"
						type="email"
						autoComplete="off"
						autoCapitalize="none"
						spellCheck={false}
						aria-invalid={emailError ? true : undefined}
						aria-describedby={emailError ? 'accueil-email-error' : undefined}
						className={FIELD_CLASS}
						{...register('email')}
					/>
					{emailError ? (
						<p id="accueil-email-error" className="text-lipstick-800 text-sm">
							{emailError}
						</p>
					) : null}
				</div>
			</div>
			<div className="flex flex-col gap-2 rounded-2xl bg-nude-100 p-4">
				<label htmlFor="accueil-consentement" className="flex min-h-11 items-start gap-3 text-sm">
					<input
						id="accueil-consentement"
						type="checkbox"
						aria-describedby="accueil-consentement-aide"
						className="mt-1 size-5 shrink-0 accent-lipstick"
						{...register('contactPublic')}
					/>
					<span className="font-medium">Afficher mon téléphone et mon email sur ma page</span>
				</label>
				<p id="accueil-consentement-aide" className="text-mute text-sm">
					{typed.contactPublic
						? 'Coché, tout le monde peut les lire sur ta page. La date de ton choix est gardée.'
						: 'Décoché, personne ne les voit : ils restent à toi. Sans cette case, ils ne comptent pas pour te joindre.'}
				</p>
				{choiceError ? <p className="text-lipstick-800 text-sm">{choiceError}</p> : null}
			</div>
		</BlockForm>
	)
}
