'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { trackSave } from '@/lib/dashboard/analytics'
import {
	CONTACT_DETAILS_FIELDS,
	type ContactDetailsValues,
	contactDetailsSchema,
	type SavedContactDetails,
} from '@/lib/dashboard/contact-details'
import { FAILURE_MESSAGE, type SaveResult } from '@/lib/dashboard/result'
import { EditingPanel } from './EditingPanel'

export type ContactDetailsUpload = (valeurs: ContactDetailsValues) => Promise<SaveResult<SavedContactDetails>>

const BUTTON = 'min-h-11 rounded-md px-4 py-2 font-medium'
const FIELD = 'min-h-11 rounded-md border border-neutral-400 bg-white px-3 py-2 text-base'

/**
 * The button « Modifier » of the card of her contact details, and the panel it opens (ticket 126).
 * Same contract as the identity: bounds under the field with nothing sent (U28, E30), a failure
 * that keeps the old value and what she typed (E31), one request for two clicks, a result
 * announced outside of the panel.
 *
 * The choice « afficher sur mon profil » is hers: the panel says what it means, and the server
 * dates it. The card shows the date once the page is read again.
 */
export function ContactDetailsEditor({
	valeurs,
	envoyer,
}: {
	valeurs: ContactDetailsValues
	envoyer: ContactDetailsUpload
}) {
	const [open, setOpen] = useState(false)
	const [announcement, setAnnouncement] = useState('')
	const trigger = useRef<HTMLButtonElement>(null)

	return (
		<>
			<button
				ref={trigger}
				type="button"
				aria-haspopup="dialog"
				aria-label="Modifier mes coordonnées"
				onClick={() => {
					setAnnouncement('')
					setOpen(true)
				}}
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
				<ContactDetailsForm
					valeurs={valeurs}
					envoyer={envoyer}
					retour={trigger}
					onEnregistre={affichees => {
						setAnnouncement(
							affichees
								? 'Tes coordonnées sont enregistrées : elles s’affichent sur ton profil.'
								: 'Tes coordonnées sont enregistrées : elles ne s’affichent pas sur ton profil.'
						)
						setOpen(false)
					}}
					onFermer={() => setOpen(false)}
				/>
			) : null}
		</>
	)
}

function ContactDetailsForm({
	valeurs,
	envoyer,
	retour,
	onEnregistre,
	onFermer,
}: {
	valeurs: ContactDetailsValues
	envoyer: ContactDetailsUpload
	retour: React.RefObject<HTMLButtonElement | null>
	onEnregistre: (affichees: boolean) => void
	onFermer: () => void
}) {
	const {
		register,
		handleSubmit,
		setError,
		formState: { errors, isDirty },
	} = useForm<ContactDetailsValues>({ resolver: zodResolver(contactDetailsSchema), defaultValues: valeurs })
	const [pending, setPending] = useState(false)
	const [message, setMessage] = useState('')
	const lock = useRef(false)

	async function save(saisie: ContactDetailsValues) {
		setPending(true)
		setMessage('')
		try {
			const result: SaveResult<SavedContactDetails> = await envoyer(saisie).catch(() => ({
				ok: false,
				message: FAILURE_MESSAGE,
			}))
			trackSave('coordonnees', result)
			if (result.ok) {
				onEnregistre(result.valeurs.contactPublic)
				return
			}
			setMessage(result.message)
			for (const field of CONTACT_DETAILS_FIELDS) {
				const text = result.champs?.[field]
				if (text) setError(field, { message: text })
			}
		} finally {
			lock.current = false
			setPending(false)
		}
	}

	const phoneError = errors.telephone?.message
	const emailError = errors.email?.message
	const choiceError = errors.contactPublic?.message

	return (
		<EditingPanel
			titre="Modifier mes coordonnées"
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
					<label htmlFor="coordonnees-telephone" className="font-medium text-sm">
						Téléphone
					</label>
					<input
						id="coordonnees-telephone"
						type="tel"
						autoComplete="off"
						aria-invalid={phoneError ? true : undefined}
						aria-describedby={phoneError ? 'coordonnees-telephone-erreur' : undefined}
						className={FIELD}
						{...register('telephone')}
					/>
					{phoneError ? (
						<p id="coordonnees-telephone-erreur" className="text-red-800 text-sm">
							{phoneError}
						</p>
					) : null}
				</div>
				<div className="flex flex-col gap-1">
					<label htmlFor="coordonnees-email" className="font-medium text-sm">
						Email de contact
					</label>
					<input
						id="coordonnees-email"
						type="email"
						autoComplete="off"
						autoCapitalize="none"
						spellCheck={false}
						aria-invalid={emailError ? true : undefined}
						aria-describedby={emailError ? 'coordonnees-email-erreur' : undefined}
						className={FIELD}
						{...register('email')}
					/>
					{emailError ? (
						<p id="coordonnees-email-erreur" className="text-red-800 text-sm">
							{emailError}
						</p>
					) : null}
				</div>
				<div className="flex flex-col gap-1">
					<label htmlFor="coordonnees-affichage" className="flex min-h-11 items-start gap-3 text-sm">
						<input
							id="coordonnees-affichage"
							type="checkbox"
							aria-describedby="coordonnees-affichage-aide"
							className="mt-1 size-5 shrink-0"
							{...register('contactPublic')}
						/>
						<span className="font-medium">Afficher mon téléphone et mon email sur mon profil</span>
					</label>
					<p id="coordonnees-affichage-aide" className="text-neutral-700 text-sm">
						Décoché, personne ne les voit : ils restent à toi. Coché, tout le monde peut les lire sur ta page. La date
						de ton choix est gardée, et tu peux le changer quand tu veux.
					</p>
					{choiceError ? <p className="text-red-800 text-sm">{choiceError}</p> : null}
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
