'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { trackSave } from '@/lib/dashboard/analytics'
import {
	DESCRIPTION_MAX,
	DESCRIPTION_MIN,
	type DescriptionValues,
	descriptionCounter,
	descriptionSchema,
} from '@/lib/dashboard/description'
import { FAILURE_MESSAGE, type SaveResult } from '@/lib/dashboard/result'
import { BlockForm, FIELD_CLASS } from '../BlockForm'
import { EditableBlock } from '../EditableBlock'

export type AboutSave = (values: DescriptionValues) => Promise<SaveResult<DescriptionValues>>

/**
 * Her presentation text (« À propos »), edited in place (issue 1016). The text, its bound and its
 * counter are those of her space (`descriptionSchema`, `descriptionCounter`): the form and the server
 * read the same schema, HTML is removed, 2 000 characters at most. The counter says the limit while
 * she types, before any refusal, and when the text is long enough to make the profile publishable.
 */
export function AboutBlock({
	values,
	save,
	children,
}: {
	values: DescriptionValues
	save: AboutSave
	/** The block as the visitor sees it, or `null` while there is nothing to show. */
	children: ReactNode | null
}) {
	return (
		<EditableBlock
			id="about"
			title="Présentation"
			penLabel="Modifier ma présentation"
			empty={children === null}
			shape="card"
			className="w-full min-w-0"
			penClassName="right-3 top-3"
			invitation={
				<span className="pr-8">
					<b className="text-lipstick">Présente-toi en quelques lignes.</b> Ton style, ta clientèle, ta façon de
					travailler. Par exemple : « Je maquille depuis huit ans, surtout des mariées et des invitées. »
				</span>
			}
			editor={<AboutForm values={values} save={save} />}
		>
			{children}
		</EditableBlock>
	)
}

function AboutForm({ values, save }: { values: DescriptionValues; save: AboutSave }) {
	const {
		register,
		handleSubmit,
		setError,
		watch,
		formState: { errors, isDirty },
	} = useForm<DescriptionValues>({ resolver: zodResolver(descriptionSchema), defaultValues: values })
	const counter = descriptionCounter(watch('description') ?? '')
	const error = errors.description?.message
	const tooLong = counter.total > DESCRIPTION_MAX

	return (
		<BlockForm
			title="Modifier ma présentation"
			dirty={isDirty}
			keepsHint="ton texte est toujours là"
			onFailure={failure => {
				const text = failure.fields?.description
				if (text) setError('description', { message: text })
			}}
			onSend={() =>
				new Promise(resolve => {
					// Refused in the browser: the message is under the field and nothing is sent.
					void handleSubmit(
						async input => {
							const result = await save(input).catch(
								(): SaveResult<DescriptionValues> => ({ ok: false, message: FAILURE_MESSAGE })
							)
							trackSave('description', result)
							resolve(result)
						},
						() => resolve(null)
					)()
				})
			}
		>
			<div className="flex flex-col gap-2">
				<label htmlFor="direct-about-text" className="font-medium text-mute text-sm">
					Ce qui te distingue : ton style, ta clientèle, ta façon de travailler.
				</label>
				<textarea
					id="direct-about-text"
					rows={7}
					autoComplete="off"
					aria-invalid={error || tooLong ? true : undefined}
					aria-describedby={`direct-about-counter${error ? ' direct-about-error' : ''}`}
					className={`${FIELD_CLASS} py-3 leading-relaxed`}
					{...register('description')}
				/>
				<p
					id="direct-about-counter"
					data-testid="about-counter"
					className={`font-medium text-sm ${tooLong ? 'text-lipstick-800' : 'text-mute'}`}
				>
					{counter.total} sur {DESCRIPTION_MAX} caractères au plus
					{tooLong ? ` : c’est ${counter.total - DESCRIPTION_MAX} de trop` : ''}. Pour que ton profil soit publiable, il
					en faut {DESCRIPTION_MIN} ({counter.compte} comptés).
				</p>
				<p role="status" className="text-ok text-sm">
					{counter.assez ? 'Ta présentation a la longueur qu’il faut pour être publiable.' : ''}
				</p>
				{error ? (
					<p id="direct-about-error" className="text-lipstick-800 text-sm">
						{error}
					</p>
				) : null}
			</div>
		</BlockForm>
	)
}
