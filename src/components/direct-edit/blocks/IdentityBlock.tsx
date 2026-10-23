'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { trackSave } from '@/lib/dashboard/analytics'
import { IDENTITY_FIELDS, IDENTITY_LABELS, type IdentityValues, identitySchema } from '@/lib/dashboard/identity'
import { FAILURE_MESSAGE, type SaveResult } from '@/lib/dashboard/result'
import { BlockForm, FIELD_CLASS } from '../BlockForm'
import { EditableBlock } from '../EditableBlock'

export type IdentitySave = (valeurs: IdentityValues) => Promise<SaveResult<IdentityValues>>

/**
 * Her name and her speciality, edited in place (issue 1008). The four fields travel together because
 * the server takes exactly these four (`strictIdentitySchema`): the one block holds the first name,
 * the last name, the artist name and the speciality, and sends all of them with their stored values.
 * Same schema as the card of her space, read by the form and by the server alike.
 *
 * `missingSpecialty` adds an invitation under her name, since her name is never empty.
 */
export function IdentityBlock({
	values,
	save,
	missingSpecialty,
	children,
}: {
	values: IdentityValues
	save: IdentitySave
	missingSpecialty: boolean
	children: ReactNode
}) {
	return (
		<EditableBlock
			id="identity"
			title="Nom et spécialité"
			penLabel="Modifier mon nom et ma spécialité"
			empty={false}
			invitation={null}
			shape="card"
			className="w-full min-w-0 md:w-auto md:flex-1"
			penClassName="right-0 top-0"
			editor={<IdentityForm values={values} save={save} />}
		>
			<div className="flex min-w-0 flex-col items-center gap-2 py-2 pr-12 pl-2 text-center md:items-start md:text-left">
				{children}
				{missingSpecialty ? (
					<span
						data-direct-edit-empty
						className="inline-flex min-h-11 items-center rounded-2xl border-2 border-nude-300 border-dashed bg-blush px-4 font-body font-medium text-mute text-sm"
					>
						<b className="mr-1 text-lipstick">Ajoute ta spécialité.</b> Elle s’affiche sous ton nom.
					</span>
				) : null}
			</div>
		</EditableBlock>
	)
}

function IdentityForm({ values, save }: { values: IdentityValues; save: IdentitySave }) {
	const {
		register,
		handleSubmit,
		setError,
		formState: { errors, isDirty },
	} = useForm<IdentityValues>({ resolver: zodResolver(identitySchema), defaultValues: values })

	return (
		<BlockForm
			title="Modifier mon nom et ma spécialité"
			dirty={isDirty}
			keepsHint="ta saisie est toujours là"
			onFailure={failure => {
				for (const field of IDENTITY_FIELDS) {
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
								(): SaveResult<IdentityValues> => ({ ok: false, message: FAILURE_MESSAGE })
							)
							trackSave('identite', result)
							resolve(result)
						},
						() => resolve(null)
					)()
				})
			}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				{IDENTITY_FIELDS.map(field => {
					const error = errors[field]?.message
					return (
						<div key={field} className="flex flex-col gap-1">
							<label htmlFor={`direct-identity-${field}`} className="font-medium text-sm">
								{IDENTITY_LABELS[field].libelle}
							</label>
							<input
								id={`direct-identity-${field}`}
								type="text"
								autoComplete="off"
								aria-invalid={error ? true : undefined}
								aria-describedby={error ? `direct-identity-${field}-error` : undefined}
								className={FIELD_CLASS}
								{...register(field)}
							/>
							{error ? (
								<p id={`direct-identity-${field}-error`} className="text-lipstick-800 text-sm">
									{error}
								</p>
							) : null}
						</div>
					)
				})}
			</div>
		</BlockForm>
	)
}
