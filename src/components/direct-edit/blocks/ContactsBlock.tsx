'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { trackSave } from '@/lib/dashboard/analytics'
import {
	CONTACT_DETAILS_FIELDS,
	type ContactDetailsValues,
	contactDetailsSchema,
	longDate,
	type SavedContactDetails,
} from '@/lib/dashboard/contact-details'
import { FAILURE_MESSAGE, type SaveResult } from '@/lib/dashboard/result'
import { BlockForm, FIELD_CLASS } from '../BlockForm'
import { EditableBlock } from '../EditableBlock'

export type ContactsSave = (values: ContactDetailsValues) => Promise<SaveResult<SavedContactDetails>>

/**
 * Her phone and her contact email, edited in place (issue 1020). They are shown on her page only with
 * her explicit choice, dated by the server (`consentedAt`), and never in the public lists. The form is
 * the one of her space: same schema, same action. Withdrawing the choice takes them off her page at the
 * next visit: the write refreshes the pages that read the profile.
 *
 * What she stored and chose is the `values` she is given; what the visitor sees is `children`, `null`
 * while nothing is shown. Hidden details are told in the invitation, so that she knows the block is not
 * empty by mistake.
 */
export function ContactsBlock({
	values,
	consentedAt,
	save,
	children,
}: {
	values: ContactDetailsValues
	/** ISO date of the choice to show them, `null` while they are hidden. */
	consentedAt: string | null
	save: ContactsSave
	/** The block as the visitor sees it, or `null` while nothing is shown. */
	children: ReactNode | null
}) {
	const stored = values.telephone !== '' || values.email !== ''
	return (
		<EditableBlock
			id="contacts"
			title="Coordonnées"
			penLabel="Modifier mes coordonnées"
			empty={children === null}
			shape="card"
			className="w-full min-w-0"
			penClassName="right-3 top-3"
			invitation={
				stored ? (
					<span className="pr-8">
						<b className="text-lipstick">Tes coordonnées ne s’affichent pas.</b> Elles sont enregistrées, mais tu n’as
						pas choisi de les montrer : les clientes ne peuvent pas te joindre par téléphone ni par email.
					</span>
				) : (
					<span className="pr-8">
						<b className="text-lipstick">Ajoute ton téléphone ou ton email.</b> Ils ne s’affichent que si tu le choisis.
					</span>
				)
			}
			editor={<ContactsForm values={values} consentedAt={consentedAt} save={save} />}
		>
			{children}
		</EditableBlock>
	)
}

function ContactsForm({
	values,
	consentedAt,
	save,
}: {
	values: ContactDetailsValues
	consentedAt: string | null
	save: ContactsSave
}) {
	const {
		register,
		handleSubmit,
		setError,
		watch,
		formState: { errors, isDirty },
	} = useForm<ContactDetailsValues>({ resolver: zodResolver(contactDetailsSchema), defaultValues: values })
	const shown = watch('contactPublic')
	const since = values.contactPublic ? longDate(consentedAt) : null
	const phoneError = errors.telephone?.message
	const emailError = errors.email?.message
	const choiceError = errors.contactPublic?.message

	return (
		<BlockForm
			title="Modifier mes coordonnées"
			dirty={isDirty}
			keepsHint="ta saisie est toujours là"
			onFailure={failure => {
				for (const field of CONTACT_DETAILS_FIELDS) {
					const text = failure.fields?.[field]
					if (text) setError(field, { message: text })
				}
			}}
			onSend={() =>
				new Promise(resolve => {
					// Refused in the browser: the message is under the field and nothing is sent.
					void handleSubmit(
						async input => {
							const result = await save(input).catch(
								(): SaveResult<SavedContactDetails> => ({ ok: false, message: FAILURE_MESSAGE })
							)
							trackSave('coordonnees', result)
							resolve(result)
						},
						() => resolve(null)
					)()
				})
			}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1">
					<label htmlFor="direct-contacts-phone" className="font-medium text-sm">
						Téléphone
					</label>
					<input
						id="direct-contacts-phone"
						type="tel"
						autoComplete="off"
						aria-invalid={phoneError ? true : undefined}
						aria-describedby={phoneError ? 'direct-contacts-phone-error' : undefined}
						className={FIELD_CLASS}
						{...register('telephone')}
					/>
					{phoneError ? (
						<p id="direct-contacts-phone-error" className="text-lipstick-800 text-sm">
							{phoneError}
						</p>
					) : null}
				</div>
				<div className="flex flex-col gap-1">
					<label htmlFor="direct-contacts-email" className="font-medium text-sm">
						Email de contact
					</label>
					<input
						id="direct-contacts-email"
						type="email"
						autoComplete="off"
						autoCapitalize="none"
						spellCheck={false}
						aria-invalid={emailError ? true : undefined}
						aria-describedby={emailError ? 'direct-contacts-email-error' : undefined}
						className={FIELD_CLASS}
						{...register('email')}
					/>
					{emailError ? (
						<p id="direct-contacts-email-error" className="text-lipstick-800 text-sm">
							{emailError}
						</p>
					) : null}
				</div>
			</div>
			<div className="flex flex-col gap-2 rounded-2xl bg-nude-100 p-4">
				<label htmlFor="direct-contacts-consent" className="flex min-h-11 items-start gap-3 text-sm">
					<input
						id="direct-contacts-consent"
						type="checkbox"
						aria-describedby="direct-contacts-consent-help"
						className="mt-1 size-5 shrink-0 accent-lipstick"
						{...register('contactPublic')}
					/>
					<span className="font-medium">Afficher mon téléphone et mon email sur ma page</span>
				</label>
				<p id="direct-contacts-consent-help" className="text-mute text-sm">
					{shown
						? 'Coché, tout le monde peut les lire sur ta page. La date de ton choix est gardée.'
						: 'Décoché, personne ne les voit : ils restent à toi, et ils disparaissent de ta page dès l’enregistrement.'}
					{since ? ` Tu as choisi de les montrer le ${since}.` : ''}
				</p>
				{choiceError ? <p className="text-lipstick-800 text-sm">{choiceError}</p> : null}
			</div>
		</BlockForm>
	)
}
