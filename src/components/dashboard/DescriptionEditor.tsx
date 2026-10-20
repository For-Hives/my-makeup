'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRef, useState } from 'react'
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
import { EditingPanel } from './EditingPanel'

export type DescriptionUpload = (valeurs: DescriptionValues) => Promise<SaveResult<DescriptionValues>>

const BUTTON = 'min-h-11 rounded-md px-4 py-2 font-medium'
const FIELD = 'min-h-64 rounded-md border border-neutral-400 bg-white px-3 py-2 text-base'

/**
 * The button « Modifier » of the card of her description, and the panel it opens (ticket 122). Same
 * contract as her identity (ticket 119): the card changes only once the server has stored the text,
 * a failure keeps the old text and what she typed and says so (E31), two clicks send one request.
 *
 * Under the field, a counter shows how many characters count towards a publishable profile (200,
 * counted by the single definition of the profile, U05) and the room left of the 2 000 allowed. The
 * counter is read by the screen reader as the description of the field; the moment the threshold is
 * reached is announced once, not at every key.
 *
 * The send function is a property: the page gives the server action, a test gives a fake.
 */
export function DescriptionEditor({ valeurs, envoyer }: { valeurs: DescriptionValues; envoyer: DescriptionUpload }) {
	const [open, setOpen] = useState(false)
	const [announcement, setAnnouncement] = useState('')
	const trigger = useRef<HTMLButtonElement>(null)

	return (
		<>
			<button
				ref={trigger}
				type="button"
				aria-haspopup="dialog"
				aria-label="Modifier ma description"
				onClick={() => {
					setAnnouncement('')
					setOpen(true)
				}}
				// Held down, Enter repeats: it opens the panel once.
				onKeyDown={evenement => {
					if (evenement.repeat) evenement.preventDefault()
				}}
				className={`${BUTTON} border border-neutral-400 bg-white`}
			>
				Modifier
			</button>
			<p role="status" className="w-full text-green-800 text-sm">
				{announcement}
			</p>
			{open ? (
				<DescriptionForm
					valeurs={valeurs}
					envoyer={envoyer}
					retour={trigger}
					onEnregistre={() => {
						setAnnouncement('Ta description est enregistrée.')
						setOpen(false)
					}}
					onFermer={() => setOpen(false)}
				/>
			) : null}
		</>
	)
}

function DescriptionForm({
	valeurs,
	envoyer,
	retour,
	onEnregistre,
	onFermer,
}: {
	valeurs: DescriptionValues
	envoyer: DescriptionUpload
	retour: React.RefObject<HTMLButtonElement | null>
	onEnregistre: () => void
	onFermer: () => void
}) {
	const {
		register,
		handleSubmit,
		setError,
		watch,
		formState: { errors, isDirty },
	} = useForm<DescriptionValues>({ resolver: zodResolver(descriptionSchema), defaultValues: valeurs })
	const [pending, setPending] = useState(false)
	const [message, setMessage] = useState('')
	const lock = useRef(false)
	const counter = descriptionCounter(watch('description') ?? '')
	const error = errors.description?.message

	async function save(saisie: DescriptionValues) {
		setPending(true)
		setMessage('')
		try {
			const result: SaveResult<DescriptionValues> = await envoyer(saisie).catch(() => ({
				ok: false,
				message: FAILURE_MESSAGE,
			}))
			trackSave('description', result)
			if (result.ok) {
				onEnregistre()
				return
			}
			setMessage(result.message)
			if (result.champs?.description) setError('description', { message: result.champs.description })
		} finally {
			lock.current = false
			setPending(false)
		}
	}

	return (
		<EditingPanel
			titre="Modifier ma description"
			enCours={pending}
			modifie={isDirty}
			retour={retour}
			onFermer={onFermer}
		>
			<form
				noValidate
				aria-busy={pending}
				onSubmit={evenement => {
					evenement.preventDefault()
					if (lock.current) return
					lock.current = true
					void handleSubmit(save, () => {
						lock.current = false
					})(evenement)
				}}
				className="flex flex-col gap-4"
			>
				<div className="flex flex-col gap-1">
					<label htmlFor="description-texte" className="font-medium text-sm">
						Ta description
					</label>
					<textarea
						id="description-texte"
						autoComplete="off"
						aria-invalid={error ? true : undefined}
						aria-describedby={`description-compteur${error ? ' description-erreur' : ''}`}
						className={FIELD}
						{...register('description')}
					/>
					<p id="description-compteur" data-testid="compteur-description" className="text-neutral-700 text-sm">
						{counter.compte} / {DESCRIPTION_MIN} caractères pour que ton profil soit publiable ({counter.total} /{' '}
						{DESCRIPTION_MAX} au plus{counter.total > DESCRIPTION_MAX ? ' : c’est trop long' : ''})
					</p>
					<p role="status" className="text-green-800 text-sm">
						{counter.assez ? 'Ta description a la longueur qu’il faut pour être publiable.' : ''}
					</p>
					{error ? (
						<p id="description-erreur" className="text-red-800 text-sm">
							{error}
						</p>
					) : null}
				</div>
				<div role="alert">
					{message ? <p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">{message}</p> : null}
				</div>
				<button
					type="submit"
					disabled={pending}
					className={`${BUTTON} bg-neutral-900 text-white disabled:cursor-wait disabled:opacity-60`}
				>
					{pending ? 'Enregistrement…' : 'Enregistrer'}
				</button>
			</form>
		</EditingPanel>
	)
}
