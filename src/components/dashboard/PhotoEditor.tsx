'use client'

import { useEffect, useRef, useState } from 'react'
import { expiredSessionUrl } from '@/lib/auth/return-to'
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
import { EditingPanel } from './EditingPanel'

export type PhotoUpload = (saisie: { photoPrincipale: PhotoId }) => Promise<SaveResult<PhotoValues>>

/** The page of the space the editor lives on: where the sign-in page brings her back. */
const DASHBOARD_PAGE = '/auth/profil'

/** The alternative text a main photo is stored with. */
export const MAIN_PICTURE_ALT = 'Photo principale'

const BUTTON = 'min-h-11 rounded-md px-4 py-2 font-medium'

/** How a chosen file is shown before it is sent: a local address, or nothing where the browser has none. */
export function localPreview(fichier: Blob): string {
	try {
		return URL.createObjectURL(fichier)
	} catch {
		return ''
	}
}

/** Gives back a local address made by `apercuLocal`. */
export function releasePreview(adresse: string): void {
	try {
		if (adresse !== '') URL.revokeObjectURL(adresse)
	} catch {
		// Nothing to give back.
	}
}

interface Chosen extends PhotoToSend {
	apercu: string
}

/**
 * The button « Modifier » of the card « Photo principale », and the panel it opens (ticket 134).
 *
 * - She picks a file; it is checked and reduced in the browser (2 000 px, 1 Mo at most), and shown.
 *   A file that is not accepted is refused here, with the reason, before anything is sent (E36).
 * - Nothing is sent before « Enregistrer »: closing the panel leaves no object on the server.
 * - « Enregistrer » sends the reduced file, then names it as her main photo; the former one goes
 *   to the bin of the storage. A failure leaves the former photo, keeps what she chose, and says so.
 *   Whatever the failure, a file sent in the gesture is deleted again unless the outcome is unknown
 *   (`envoyerPuisEnregistrer`).
 * - The result is announced in a `role="status"` outside the panel.
 *
 * The browser work, the network and the server action are properties: a test gives fakes.
 */
export function PhotoEditor({
	photo,
	envoyer,
	preparer = prepareBrowserPhoto,
	televerser = (fichier, alt) => uploadPhoto(fichier, alt),
	supprimer = id => deleteMedia(id),
}: {
	photo: DashboardPhoto | null
	envoyer: PhotoUpload
	preparer?: (fichier: File) => Promise<PreparedPhoto<File>>
	televerser?: (fichier: File, alt: string) => Promise<FileUploadResult>
	supprimer?: (id: PhotoId) => Promise<unknown>
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
				aria-label="Modifier ma photo principale"
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
				<PhotoForm
					photo={photo}
					envoyer={envoyer}
					preparer={preparer}
					televerser={televerser}
					supprimer={supprimer}
					retour={trigger}
					onEnregistre={() => {
						setAnnouncement('Ta photo principale est enregistrée.')
						setOpen(false)
					}}
					onFermer={() => setOpen(false)}
				/>
			) : null}
		</>
	)
}

function PhotoForm({
	photo,
	envoyer,
	preparer,
	televerser,
	supprimer,
	retour,
	onEnregistre,
	onFermer,
}: {
	photo: DashboardPhoto | null
	envoyer: PhotoUpload
	preparer: (fichier: File) => Promise<PreparedPhoto<File>>
	televerser: (fichier: File, alt: string) => Promise<FileUploadResult>
	supprimer: (id: PhotoId) => Promise<unknown>
	retour: React.RefObject<HTMLButtonElement | null>
	onEnregistre: () => void
	onFermer: () => void
}) {
	const [chosen, setChosen] = useState<Chosen | null>(null)
	const [error, setError] = useState('')
	const [message, setMessage] = useState('')
	const [expiredSession, setExpiredSession] = useState(false)
	const [preparation, setPreparation] = useState(false)
	const [pending, setPending] = useState(false)
	const lock = useRef(false)
	const currentPreview = useRef('')

	// The local address is given back when the panel goes.
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
				trackPhotoRefusal(localRefusalCause(ready))
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
			const issue = await sendThenSave<PhotoValues>({
				photos: [chosen],
				televerser: async (fichier, alt) => {
					const upload = await televerser(fichier, alt)
					// A session that ended is not a refusal of the photo.
					if (!upload.ok && upload.session !== 'expiree') trackPhotoRefusal(upload.cause ?? 'server')
					return upload
				},
				supprimer,
				enregistrer: async ids => {
					const [id] = ids
					const result = await envoyer({ photoPrincipale: id as PhotoId })
					// Only an answer of the server is a save; a lost call counts nothing.
					trackSave('photo', result)
					return result
				},
				marquerEnvoyee: (_cle, id) => setChosen(courante => (courante === null ? courante : { ...courante, id })),
			})
			if (issue.ok) {
				onEnregistre()
				return
			}
			setMessage(issue.champs?.photoPrincipale ?? issue.message)
			setExpiredSession(issue.session === 'expiree')
		} finally {
			lock.current = false
			setPending(false)
		}
	}

	const shown = chosen?.apercu || photo?.url || ''
	return (
		<EditingPanel
			titre="Modifier ma photo principale"
			enCours={pending || preparation}
			modifie={chosen !== null}
			retour={retour}
			onFermer={onFermer}
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
					{shown ? (
						// biome-ignore lint/performance/noImgElement: a local preview of a file not sent yet cannot go through the image optimizer
						<img
							src={shown}
							alt={chosen ? 'Aperçu de la photo choisie' : 'Ta photo principale actuelle'}
							className="h-48 w-48 rounded-full object-cover"
						/>
					) : (
						<p className="text-neutral-600 italic">Tu n’as pas encore de photo principale.</p>
					)}
				</div>
				<div className="flex flex-col gap-1">
					<label htmlFor="photo-fichier" className="font-medium text-sm">
						{photo || chosen ? 'Choisir une autre photo' : 'Choisir une photo'}
					</label>
					<input
						id="photo-fichier"
						type="file"
						accept={ACCEPT}
						disabled={pending}
						aria-describedby="photo-aide"
						onChange={evenement => {
							const file = evenement.target.files?.[0]
							// The same file can be picked again.
							evenement.target.value = ''
							if (file) void choose(file)
						}}
						className="min-h-11 rounded-md border border-neutral-400 bg-white px-3 py-2 text-base"
					/>
					<p id="photo-aide" className="text-neutral-700 text-sm">
						JPEG, PNG ou WebP. La photo est réduite avant l’envoi, et rien n’est envoyé avant « Enregistrer ».
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
				<div role="alert">
					{message ? (
						<p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">
							{message}
							{expiredSession ? (
								<>
									{' '}
									<a
										className="font-medium underline"
										href={expiredSessionUrl(DASHBOARD_PAGE)}
										target="_blank"
										rel="noopener"
									>
										Te reconnecter (nouvel onglet)
									</a>
									, puis reviens ici et enregistre à nouveau : ta photo est toujours là.
								</>
							) : null}
						</p>
					) : null}
				</div>
				<button
					type="submit"
					disabled={pending || preparation || chosen === null}
					className={`${BUTTON} bg-neutral-900 text-white disabled:cursor-not-allowed disabled:opacity-60`}
				>
					{pending ? 'Enregistrement…' : 'Enregistrer'}
				</button>
			</form>
		</EditingPanel>
	)
}
