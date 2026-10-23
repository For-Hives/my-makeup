'use client'

import { useEffect, useRef, useState } from 'react'
import { prepareBrowserPhoto } from '@/lib/dashboard/browser-photo'
import { STEPS_TITLES } from '@/lib/dashboard/onboarding'
import { ACCEPT, type PreparedPhoto } from '@/lib/dashboard/photo'
import type { PhotoId } from '@/lib/dashboard/photos'
import {
	deleteMedia,
	type FileUploadResult,
	type PhotoToSend,
	sendThenSave,
	uploadPhoto,
} from '@/lib/dashboard/photos-upload'
import type { SaveResult } from '@/lib/dashboard/result'
import type { OnboardingPhotoValues } from '@/lib/dashboard/save-onboarding'
import { localPreview, MAIN_PICTURE_ALT, releasePreview } from '../PhotoEditor'
import { PhotoPickerButton } from '../PhotoPickerButton'
import { BUTTON, FailureMessage, MAIN_BUTTON, StepFrame } from './shared'

export type OnboardingPhotoUpload = (saisie: { photoPrincipale: PhotoId }) => Promise<SaveResult<OnboardingPhotoValues>>

/** The alternative text of the preview (a constant: the rule on `alt` reads literals only). */
const PREVIEW_ALT = 'Aperçu de la photo choisie'

interface Chosen extends PhotoToSend {
	apercu: string
}

/**
 * The third step: her main photo (ticket 140), on the contract of the card of her space (ticket
 * 134): the file is checked and reduced in the browser, nothing leaves before « Terminer », a failure
 * keeps the photo she chose and says so, and a file sent in a gesture that fails is deleted again.
 * Nothing is claimed here: the step gives the server's answer to its parent, which sends her to her
 * space only if the server reports the three steps done.
 */
export function PhotoStep({
	envoyer,
	preparer = prepareBrowserPhoto,
	televerser = (fichier, alt) => uploadPhoto(fichier, alt),
	supprimer = id => deleteMedia(id),
	titre,
	surFait,
	retour,
}: {
	envoyer: OnboardingPhotoUpload
	preparer?: (fichier: File) => Promise<PreparedPhoto<File>>
	televerser?: (fichier: File, alt: string) => Promise<FileUploadResult>
	supprimer?: (id: PhotoId) => Promise<unknown>
	titre: React.RefObject<HTMLHeadingElement | null>
	surFait: (valeurs: OnboardingPhotoValues) => void
	retour: () => void
}) {
	const [chosen, setChosen] = useState<Chosen | null>(null)
	const [error, setError] = useState('')
	const [message, setMessage] = useState('')
	const [expiredSession, setExpiredSession] = useState(false)
	const [preparation, setPreparation] = useState(false)
	const [pending, setPending] = useState(false)
	const lock = useRef(false)
	const currentPreview = useRef('')

	// The local address is given back when the step goes.
	useEffect(
		() => () => {
			releasePreview(currentPreview.current)
		},
		[]
	)

	async function choose(fichier: File) {
		setError('')
		setMessage('')
		setPreparation(true)
		try {
			const ready = await preparer(fichier)
			if (!ready.ok) {
				setError(ready.message)
				return
			}
			releasePreview(currentPreview.current)
			const preview = localPreview(ready.fichier)
			currentPreview.current = preview
			setChosen({ cle: 'photo', fichier: ready.fichier, alt: MAIN_PICTURE_ALT, apercu: preview })
		} finally {
			setPreparation(false)
		}
	}

	async function save() {
		if (chosen === null || lock.current) return
		lock.current = true
		setPending(true)
		setMessage('')
		setExpiredSession(false)
		try {
			const issue = await sendThenSave<OnboardingPhotoValues>({
				photos: [chosen],
				televerser,
				supprimer,
				enregistrer: ids => {
					const [id] = ids
					return envoyer({ photoPrincipale: id as PhotoId })
				},
				marquerEnvoyee: (_cle, id) => setChosen(courante => (courante === null ? courante : { ...courante, id })),
			})
			if (issue.ok) {
				surFait(issue.valeurs)
				return
			}
			setMessage(issue.champs?.photoPrincipale ?? issue.message)
			setExpiredSession(issue.session === 'expiree')
		} finally {
			lock.current = false
			setPending(false)
		}
	}

	return (
		<StepFrame
			titre={STEPS_TITLES[3]}
			explication="Une photo de toi ou de ton travail : c’est la première chose que voient les clientes."
			reference={titre}
		>
			<form
				noValidate
				aria-busy={pending}
				onSubmit={evenement => {
					evenement.preventDefault()
					void save()
				}}
				className="flex flex-col gap-4"
			>
				<div className="flex justify-center">
					{chosen?.apercu ? (
						// biome-ignore lint/performance/noImgElement: a local preview of a file not sent yet cannot go through the image optimizer
						<img src={chosen.apercu} alt={PREVIEW_ALT} className="h-48 w-48 rounded-full object-cover" />
					) : (
						<p className="text-neutral-600 italic">Tu n’as pas encore choisi de photo.</p>
					)}
				</div>
				<div className="flex flex-col gap-2">
					<PhotoPickerButton
						id="accueil-photo-fichier"
						libelle={chosen ? 'Choisir une autre photo' : 'Choisir une photo'}
						accept={ACCEPT}
						disabled={pending}
						aideId="accueil-photo-aide"
						onChange={evenement => {
							const file = evenement.target.files?.[0]
							// The same file can be picked again.
							evenement.target.value = ''
							if (file) void choose(file)
						}}
					/>
					<p id="accueil-photo-aide" className="text-neutral-700 text-sm">
						JPEG, PNG ou WebP. La photo est réduite avant l’envoi, et rien n’est envoyé avant « Terminer ».
					</p>
					{preparation ? (
						<p role="status" className="text-sm">
							Préparation de la photo…
						</p>
					) : null}
					{error ? (
						<p role="alert" className="text-red-800 text-sm">
							{error}
						</p>
					) : null}
				</div>
				<FailureMessage message={message} sessionExpiree={expiredSession} />
				<div className="flex flex-wrap gap-3">
					<button
						type="button"
						disabled={pending}
						onClick={retour}
						className={`${BUTTON} border border-neutral-400 bg-white disabled:opacity-60`}
					>
						Précédent
					</button>
					<button
						type="submit"
						disabled={pending || preparation || chosen === null}
						className={`${MAIN_BUTTON} disabled:cursor-not-allowed`}
					>
						{pending ? 'Enregistrement…' : 'Terminer'}
					</button>
				</div>
			</form>
		</StepFrame>
	)
}
