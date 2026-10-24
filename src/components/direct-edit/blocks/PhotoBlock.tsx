'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { localRefusalCause, trackPhotoRefusal, trackSave } from '@/lib/dashboard/analytics'
import { prepareBrowserPhoto } from '@/lib/dashboard/browser-photo'
import type { PhotoValues } from '@/lib/dashboard/main-picture'
import { ACCEPT, type PreparedPhoto } from '@/lib/dashboard/photo'
import type { DashboardPhoto, PhotoId } from '@/lib/dashboard/photos'
import {
	deleteMedia,
	type FileUploadResult,
	type PhotoToSend,
	sendThenSave,
	uploadPhoto,
} from '@/lib/dashboard/photos-upload'
import type { SaveResult } from '@/lib/dashboard/result'
import {
	localPreview,
	MAIN_PICTURE_ALT,
	MISSING_MAIN_PHOTO_MESSAGE,
	releasePreview,
} from '@/lib/direct-edit/photo-preview'
import { BlockForm, FIELD_CLASS } from '../BlockForm'
import { EditableBlock } from '../EditableBlock'

export type PhotoSave = (saisie: { photoPrincipale: PhotoId }) => Promise<SaveResult<PhotoValues>>

/** The browser work and the network of the photo, replaceable by a test. */
export interface PhotoWork {
	prepare?: (file: File) => Promise<PreparedPhoto<File>>
	upload?: (file: File, alt: string) => Promise<FileUploadResult>
	remove?: (id: PhotoId) => Promise<unknown>
}

interface Chosen extends PhotoToSend {
	apercu: string
}

/**
 * The main photo of her header, edited in place (issue 1008). The rules are those of the card
 * « Photo principale » of her space (ticket 134), the same code: the file is checked and reduced in the
 * browser (2 000 px, 1 Mo), nothing is sent before « Enregistrer », a file sent in a save that failed is
 * deleted again (`sendThenSave`), and the limits of the issue 309 still apply to the media route.
 *
 * The work of the browser, the network and the server action are properties: a test gives fakes.
 */
export function PhotoBlock({
	photo,
	missing = false,
	save,
	prepare = prepareBrowserPhoto,
	upload = (file, alt) => uploadPhoto(file, alt),
	remove = id => deleteMedia(id),
	children,
}: PhotoWork & {
	photo: DashboardPhoto | null
	/** Her main photo is named, but its file could not be taken over from the old site (ticket 275). */
	missing?: boolean
	save: PhotoSave
	/** The photo as the visitor sees it. */
	children: ReactNode
}) {
	return (
		<EditableBlock
			id="photo"
			title="Photo principale"
			penLabel="Modifier ma photo principale"
			empty={photo === null}
			shape="round"
			className="h-[200px] w-[200px] shrink-0"
			penClassName="right-0 bottom-0"
			invitation={
				<span>
					<b className="block text-lipstick">Ajoute ta photo</b>
					{missing ? (
						// Her main photo is named but its file is gone (ticket 275): the invitation says so, in place of the usual line.
						<span data-testid="photo-principale-manquante" className="text-xs">
							{MISSING_MAIN_PHOTO_MESSAGE}
						</span>
					) : (
						<span className="text-xs">Ta photo principale est la première chose qu’on voit.</span>
					)}
				</span>
			}
			editor={<PhotoForm photo={photo} save={save} prepare={prepare} upload={upload} remove={remove} />}
		>
			{children}
		</EditableBlock>
	)
}

/** The form of the main photo; the onboarding (issue 1009) draws it too, with its own buttons. */
export function PhotoForm({
	photo,
	save,
	prepare = prepareBrowserPhoto,
	upload = (file, alt) => uploadPhoto(file, alt),
	remove = id => deleteMedia(id),
	submitLabel,
	cancel,
}: PhotoWork & {
	photo: DashboardPhoto | null
	save: PhotoSave
	submitLabel?: string
	cancel?: ReactNode
}) {
	const [chosen, setChosen] = useState<Chosen | null>(null)
	const [error, setError] = useState('')
	const [preparing, setPreparing] = useState(false)
	const currentPreview = useRef('')

	// The local address is given back when the editor goes.
	useEffect(
		() => () => {
			releasePreview(currentPreview.current)
		},
		[]
	)

	async function choose(file: File) {
		setError('')
		setPreparing(true)
		try {
			const ready = await prepare(file)
			if (!ready.ok) {
				trackPhotoRefusal(localRefusalCause(ready))
				setError(ready.message)
				return
			}
			releasePreview(currentPreview.current)
			const preview = localPreview(ready.fichier)
			currentPreview.current = preview
			setChosen({ cle: 'photo', fichier: ready.fichier, alt: MAIN_PICTURE_ALT, apercu: preview })
		} finally {
			setPreparing(false)
		}
	}

	async function send() {
		if (chosen === null) return null
		return sendThenSave<PhotoValues>({
			photos: [chosen],
			televerser: async (file, alt) => {
				const result = await upload(file, alt)
				// A session that ended is not a refusal of the photo.
				if (!result.ok && result.session !== 'expiree') trackPhotoRefusal(result.cause ?? 'server')
				return result
			},
			supprimer: remove,
			enregistrer: async ids => {
				const [id] = ids
				const result = await save({ photoPrincipale: id as PhotoId })
				// Only an answer of the server is a save; a lost call counts nothing.
				trackSave('photo', result)
				return result
			},
			marquerEnvoyee: (_key, id) => setChosen(current => (current === null ? current : { ...current, id })),
		})
	}

	const shown = chosen?.apercu || photo?.url || ''
	return (
		<BlockForm
			title="Modifier ma photo principale"
			{...(submitLabel === undefined ? {} : { submitLabel })}
			{...(cancel === undefined ? {} : { cancel })}
			dirty={chosen !== null}
			disabled={chosen === null || preparing}
			onSend={send}
			keepsHint="ta photo est toujours là"
		>
			<div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
				<div className="flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-full bg-nude-200">
					{shown ? (
						// biome-ignore lint/performance/noImgElement: a local preview of a file not sent yet cannot go through the image optimizer
						<img
							src={shown}
							alt={chosen ? 'Aperçu de la photo choisie' : 'Ta photo principale actuelle'}
							className="h-full w-full object-cover"
						/>
					) : (
						<span className="px-4 text-center text-ink text-sm">Pas encore de photo</span>
					)}
				</div>
				<div className="flex min-w-0 flex-1 flex-col gap-2">
					<label htmlFor="direct-photo-file" className="font-medium text-sm">
						{photo || chosen ? 'Choisir une autre photo' : 'Choisir une photo'}
					</label>
					<input
						id="direct-photo-file"
						type="file"
						accept={ACCEPT}
						aria-describedby="direct-photo-help"
						onChange={event => {
							const file = event.target.files?.[0]
							// The same file can be picked again.
							event.target.value = ''
							if (file) void choose(file)
						}}
						className={FIELD_CLASS}
					/>
					<p id="direct-photo-help" className="text-mute text-sm">
						JPEG, PNG ou WebP. La photo est réduite avant l’envoi, et rien n’est envoyé avant « Enregistrer ».
					</p>
					{preparing ? (
						<p role="status" className="text-sm">
							Préparation de la photo…
						</p>
					) : null}
					{error ? (
						<p role="alert" className="text-lipstick-800 text-sm">
							{error}
						</p>
					) : null}
				</div>
			</div>
		</BlockForm>
	)
}
