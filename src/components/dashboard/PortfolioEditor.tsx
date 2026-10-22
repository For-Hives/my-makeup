'use client'

import { useEffect, useRef, useState } from 'react'
import { expiredSessionUrl } from '@/lib/auth/return-to'
import { localRefusalCause, trackPhotoRefusal, trackSave } from '@/lib/dashboard/analytics'
import { prepareBrowserPhoto } from '@/lib/dashboard/browser-photo'
import { ACCEPT, MESSAGES_PHOTO, type PreparedPhoto } from '@/lib/dashboard/photo'
import type { DashboardPhoto, PhotoId } from '@/lib/dashboard/photos'
import {
	deleteMedia,
	type FileUploadResult,
	type PhotoToSend,
	sendThenSave,
	uploadPhoto,
} from '@/lib/dashboard/photos-upload'
import type { PortfolioValues } from '@/lib/dashboard/portfolio'
import type { SaveResult } from '@/lib/dashboard/result'
import { GALLERY_MAX } from '@/lib/media'
import { type PhotoUsageView, photosLeft, usageSentence } from '@/lib/photo-limits'
import { EditingPanel } from './EditingPanel'
import { localPreview, releasePreview } from './PhotoEditor'
import { PhotoPickerButton } from './PhotoPickerButton'

export type PortfolioUpload = (saisie: { galerie: PhotoId[] }) => Promise<SaveResult<PortfolioValues>>

/** The page of the space the editor lives on: where the sign-in page brings her back. */
const DASHBOARD_PAGE = '/auth/profil'

/** The alternative text a portfolio photo is stored with. */
export const ALT_PORTFOLIO = 'Photo du portfolio'

const BUTTON = 'min-h-11 rounded-md px-4 py-2 font-medium'

/**
 * One line of the list. `cle` is its own and never changes (L1): it comes from a counter, never
 * from the content, so that two photos that look alike stay two lines. A photo already in the
 * portfolio has its `id`; a photo chosen in this panel has its reduced `fichier` and a local
 * `apercu`, until « Enregistrer » sends it.
 */
interface Row extends PhotoToSend {
	url: string
	apercu: string
	enAttente: boolean
	/** The file she picked, to refuse the same one twice. */
	signature: string
}

const signatureOf = (fichier: File): string => `${fichier.name}|${fichier.size}|${fichier.lastModified}`

/** « Photo 2 sur 3 de ton portfolio »: the text of a photo for a screen reader, whatever its stored text. */
export const altText = (rang: number, total: number): string => `Photo ${rang} sur ${total} de ton portfolio`

/**
 * The button « Modifier » of the card « Portfolio », and the panel it opens (tickets 135 and 136).
 *
 * - Each photo has a button « Retirer ». A removal is only in the panel until « Enregistrer »: closing
 *   the panel brings the photo back (136). Once saved, the photo is gone from her space and from her
 *   public profile, and its object goes to the bin of the storage unless something still uses it
 *   (the server does it, ticket 045). The browser never deletes a stored photo itself.
 * - The removal follows the rules of the lists edited in place (docs/qualite.md, §3): a line has an
 *   identifier of its own (L1); the focus stays in the panel, on the line that takes the place of the
 *   one removed, or on the line above, or, when the list is empty, on the field to add photos after a
 *   key and on the heading after a tap or a click (L4); each removal is announced (L5); Enter held
 *   removes one photo (L7).
 *
 * - She picks several files at once. Each one is checked and reduced in the browser; one that is
 *   not accepted is set aside with its reason, without losing the others (E36). Ten photos at most:
 *   the eleventh is refused (U80). The same file picked twice is refused (rule L6).
 * - Nothing is sent before « Enregistrer »: closing the panel leaves no object (E34).
 * - « Enregistrer » sends the new files, then names the whole list, in order: the photos she added
 *   come after those she had. A failure keeps the portfolio as it was and says so.
 * - The result is announced in a `role="status"` outside the panel.
 *
 * The browser work, the network and the server action are properties: a test gives fakes.
 */
export function PortfolioEditor({
	photos,
	usage,
	envoyer,
	preparer = prepareBrowserPhoto,
	televerser = (fichier, alt) => uploadPhoto(fichier, alt),
	supprimer = id => deleteMedia(id),
}: {
	photos: readonly DashboardPhoto[]
	/** What she stores and what the site allows (ticket 309): the sentence under the button, and the refusal before the send. */
	usage?: PhotoUsageView | undefined
	envoyer: PortfolioUpload
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
				aria-label="Modifier mon portfolio"
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
			{usage ? (
				<p data-testid="photo-usage" className="w-full text-neutral-700 text-sm">
					{usageSentence(usage)}
				</p>
			) : null}
			{open ? (
				<PortfolioForm
					photos={photos}
					usage={usage}
					envoyer={envoyer}
					preparer={preparer}
					televerser={televerser}
					supprimer={supprimer}
					retour={trigger}
					onEnregistre={() => {
						setAnnouncement('Ton portfolio est enregistré.')
						setOpen(false)
					}}
					onFermer={() => setOpen(false)}
				/>
			) : null}
		</>
	)
}

function PortfolioForm({
	photos,
	usage,
	envoyer,
	preparer,
	televerser,
	supprimer,
	retour,
	onEnregistre,
	onFermer,
}: {
	photos: readonly DashboardPhoto[]
	usage: PhotoUsageView | undefined
	envoyer: PortfolioUpload
	preparer: (fichier: File) => Promise<PreparedPhoto<File>>
	televerser: (fichier: File, alt: string) => Promise<FileUploadResult>
	supprimer: (id: PhotoId) => Promise<unknown>
	retour: React.RefObject<HTMLButtonElement | null>
	onEnregistre: () => void
	onFermer: () => void
}) {
	const counter = useRef(0)
	const [rows, setRows] = useState<Row[]>(() =>
		photos.map(photo => ({
			cle: `photo-${photo.id}`,
			fichier: new File([], ''),
			alt: photo.alt,
			id: photo.id,
			url: photo.url,
			apercu: '',
			enAttente: false,
			signature: '',
		}))
	)
	const [refusal, setRefusal] = useState<{ cle: string; texte: string }[]>([])
	const [announcement, setAnnouncement] = useState('')
	const [message, setMessage] = useState('')
	const [expiredSession, setExpiredSession] = useState(false)
	const [preparation, setPreparation] = useState(false)
	const [pending, setPending] = useState(false)
	const lock = useRef(false)
	const buttons = useRef(new Map<string, HTMLButtonElement>())
	const title = useRef<HTMLHeadingElement>(null)
	const field = useRef<HTMLInputElement>(null)
	// Where the focus goes once the list is drawn again, and how the last gesture was made.
	const after = useRef<{ cle: string | null } | null>(null)
	const gesture = useRef<'clavier' | 'pointeur'>('clavier')
	const announcementsCount = useRef(0)
	const currentRows = useRef(rows)
	currentRows.current = rows

	// The local addresses are given back when the panel goes.
	useEffect(
		() => () => {
			for (const row of currentRows.current) releasePreview(row.apercu)
		},
		[]
	)

	// After a removal, the focus stays in the panel (L4).
	useEffect(() => {
		const target = after.current
		if (target === null) return
		after.current = null
		const button = target.cle === null ? undefined : buttons.current.get(target.cle)
		if (button) button.focus()
		// Empty list: never a text field after a tap (it would open the keyboard of a phone).
		else if (gesture.current === 'pointeur') title.current?.focus()
		else field.current?.focus()
	}, [rows])

	function remove(cle: string) {
		const rank = rows.findIndex(ligne => ligne.cle === cle)
		const removed = rows[rank]
		if (removed === undefined) return
		releasePreview(removed.apercu)
		const remainingRows = rows.filter(ligne => ligne.cle !== cle)
		// The line that takes its place, else the one above, else nothing.
		after.current = { cle: (remainingRows[rank] ?? remainingRows[rank - 1])?.cle ?? null }
		setRows(remainingRows)
		setRefusal([])
		setMessage('')
		// The same sentence twice is not read twice: a character no one hears tells the two apart.
		announcementsCount.current += 1
		setAnnouncement(
			`${altText(rank + 1, rows.length)} est retirée. Elle disparaît de ton portfolio quand tu enregistres.${announcementsCount.current % 2 === 0 ? '\u200b' : ''}`
		)
	}

	async function choose(fichiers: File[]) {
		setMessage('')
		setPreparation(true)
		const refuses: { cle: string; texte: string }[] = []
		const refuse = (fichier: File, texte: string) => {
			counter.current += 1
			refuses.push({ cle: `refus-${counter.current}`, texte: `${fichier.name} : ${texte}` })
		}
		try {
			const accepted: Row[] = []
			const knownById = new Set(currentRows.current.map(ligne => ligne.signature).filter(Boolean))
			for (const file of fichiers) {
				if (currentRows.current.length + accepted.length >= GALLERY_MAX) {
					refuse(file, MESSAGES_PHOTO['limite-galerie'])
					continue
				}
				// Her space holds a bounded number of photos (ticket 309): the server decides, this says it before the send.
				const pendingCount = currentRows.current.filter(ligne => ligne.enAttente).length + accepted.length
				if (usage && photosLeft(usage) - pendingCount <= 0) {
					refuse(file, MESSAGES_PHOTO['limite-profil'])
					continue
				}
				const signature = signatureOf(file)
				if (knownById.has(signature)) {
					refuse(file, MESSAGES_PHOTO.doublon)
					continue
				}
				const ready = await preparer(file)
				if (!ready.ok) {
					trackPhotoRefusal(localRefusalCause(ready))
					refuse(file, ready.message)
					continue
				}
				knownById.add(signature)
				counter.current += 1
				const preview = localPreview(ready.fichier)
				accepted.push({
					cle: `local-${counter.current}`,
					fichier: ready.fichier,
					alt: ALT_PORTFOLIO,
					url: preview,
					apercu: preview,
					enAttente: true,
					signature,
				})
			}
			if (accepted.length > 0) setRows(courantes => [...courantes, ...accepted])
			setRefusal(refuses)
		} finally {
			setPreparation(false)
		}
	}

	async function save() {
		if (lock.current) return
		lock.current = true
		setPending(true)
		setMessage('')
		setExpiredSession(false)
		try {
			const issue = await sendThenSave<PortfolioValues>({
				photos: rows,
				televerser: async (fichier, alt) => {
					const upload = await televerser(fichier, alt)
					// A session that ended is not a refusal of the photo.
					if (!upload.ok && upload.session !== 'expiree') trackPhotoRefusal(upload.cause ?? 'server')
					return upload
				},
				supprimer,
				enregistrer: async ids => {
					const result = await envoyer({ galerie: ids })
					trackSave('portfolio', result)
					return result
				},
				marquerEnvoyee: (cle, id) =>
					setRows(courantes => courantes.map(ligne => (ligne.cle === cle ? { ...ligne, id } : ligne))),
			})
			if (issue.ok) {
				onEnregistre()
				return
			}
			setMessage(issue.champs?.galerie ?? issue.message)
			setExpiredSession(issue.session === 'expiree')
		} finally {
			lock.current = false
			setPending(false)
		}
	}

	const added = rows.filter(ligne => ligne.enAttente).length
	const guarded = rows.length - added
	const changed = added > 0 || guarded !== photos.length
	return (
		<EditingPanel
			titre="Modifier mon portfolio"
			enCours={pending || preparation}
			modifie={changed}
			retour={retour}
			onFermer={onFermer}
		>
			<form
				noValidate
				aria-busy={pending}
				onKeyDownCapture={() => {
					gesture.current = 'clavier'
				}}
				onMouseDownCapture={() => {
					gesture.current = 'pointeur'
				}}
				onSubmit={evenement => {
					evenement.preventDefault()
					void save()
				}}
				className="flex flex-col gap-4"
			>
				<h3 ref={title} tabIndex={-1} className="font-medium outline-none">
					Photos de ton portfolio ({rows.length} / {GALLERY_MAX})
				</h3>
				<p role="status" data-testid="annonce-retrait" className="text-sm">
					{announcement}
				</p>
				{rows.length === 0 ? (
					<p className="text-neutral-600 italic">Tu n’as pas encore de photo dans ton portfolio.</p>
				) : (
					<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
						{rows.map((ligne, rang) => (
							<li key={ligne.cle} className="flex min-w-0 flex-col gap-1">
								{/* biome-ignore lint/performance/noImgElement: a local preview of a file not sent yet cannot go through the image optimizer */}
								<img
									src={ligne.url || undefined}
									alt={altText(rang + 1, rows.length)}
									className="aspect-square w-full rounded object-cover"
								/>
								{ligne.enAttente ? <span className="font-semibold text-indigo-900 text-xs">À enregistrer</span> : null}
								<button
									type="button"
									ref={bouton => {
										if (bouton) buttons.current.set(ligne.cle, bouton)
										else buttons.current.delete(ligne.cle)
									}}
									aria-label={`Retirer la photo ${rang + 1}`}
									disabled={pending}
									onClick={() => remove(ligne.cle)}
									// Held down, Enter repeats: one removal.
									onKeyDown={evenement => {
										if (evenement.repeat) evenement.preventDefault()
									}}
									className={`${BUTTON} border border-red-300 bg-white text-red-800 disabled:opacity-60`}
								>
									Retirer
								</button>
							</li>
						))}
					</ul>
				)}
				<div className="flex flex-col gap-2">
					<PhotoPickerButton
						id="portfolio-fichiers"
						libelle="Ajouter des photos"
						accept={ACCEPT}
						multiple
						disabled={pending || preparation}
						aideId="portfolio-aide"
						inputRef={field}
						onChange={evenement => {
							const chosen = Array.from(evenement.target.files ?? [])
							// The same files can be picked again.
							evenement.target.value = ''
							if (chosen.length > 0) void choose(chosen)
						}}
					/>
					{usage ? <p className="text-neutral-700 text-sm">{usageSentence(usage)}</p> : null}
					<p id="portfolio-aide" className="text-neutral-700 text-sm">
						JPEG, PNG ou WebP, {GALLERY_MAX} photos au plus. Les photos sont réduites avant l’envoi, et rien n’est
						envoyé avant « Enregistrer ».
					</p>
					{preparation ? (
						<p role="status" className="text-sm">
							Préparation des photos…
						</p>
					) : null}
					{refusal.length > 0 ? (
						<ul role="alert" className="list-disc pl-5 text-red-800 text-sm">
							{refusal.map(({ cle, texte }) => (
								<li key={cle}>{texte}</li>
							))}
						</ul>
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
									, puis reviens ici et enregistre à nouveau : tes photos sont toujours là.
								</>
							) : null}
						</p>
					) : null}
				</div>
				<button
					type="submit"
					disabled={pending || preparation || !changed}
					className={`${BUTTON} bg-neutral-900 text-white disabled:cursor-not-allowed disabled:opacity-60`}
				>
					{pending ? 'Enregistrement…' : 'Enregistrer'}
				</button>
			</form>
		</EditingPanel>
	)
}
