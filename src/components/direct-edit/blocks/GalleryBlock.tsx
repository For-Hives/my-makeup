'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { localRefusalCause, trackPhotoRefusal, trackSave } from '@/lib/dashboard/analytics'
import { prepareBrowserPhoto } from '@/lib/dashboard/browser-photo'
import type { PhotoValues } from '@/lib/dashboard/main-picture'
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
import { FAILURE_MESSAGE, type SaveResult } from '@/lib/dashboard/result'
import { changeAlt } from '@/lib/direct-edit/media-alt'
import { ALT_PORTFOLIO, localPreview, releasePreview } from '@/lib/direct-edit/photo-preview'
import { GALLERY_MAX } from '@/lib/media'
import { type PhotoUsageView, photosLeft, usageSentence } from '@/lib/photo-limits'
import { BlockForm } from '../BlockForm'
import { EditableBlock } from '../EditableBlock'

export type PortfolioSave = (input: { galerie: PhotoId[] }) => Promise<SaveResult<PortfolioValues>>
export type MainPictureSave = (input: { photoPrincipale: PhotoId }) => Promise<SaveResult<PhotoValues>>

/** The browser work and the network of the gallery, replaceable by a test. */
export interface GalleryWork {
	prepare?: (file: File) => Promise<PreparedPhoto<File>>
	upload?: (file: File, alt: string) => Promise<FileUploadResult>
	remove?: (id: PhotoId) => Promise<unknown>
	changeAlt?: (id: PhotoId, alt: string) => Promise<boolean>
}

/** One photo of the list. `cle` is its own and never changes (L1): it never comes from its content. */
interface Row extends PhotoToSend {
	url: string
	preview: string
	pending: boolean
	/** The file she picked, to refuse the same one twice. */
	signature: string
	/** The text it was stored with, to know whether she changed it. */
	storedAlt: string
}

const signatureOf = (file: File): string => `${file.name}|${file.size}|${file.lastModified}`

/**
 * Her portfolio, edited in place (issue 1018). The rules are those of the card « Portfolio » of her
 * space, the same code: a photo is checked and reduced in the browser, nothing is sent before
 * « Enregistrer », a file sent in a save that failed is deleted again, the same file twice is refused, ten
 * photos at most, and the limits of the issue 309 (number and volume) are said before the send.
 *
 * - **The order** is changed with two buttons per photo, « Avancer » and « Reculer »: a mouse, a finger
 *   and a keyboard all reach them, and the order saved is the order of the list.
 * - **The main photo** is chosen among the photos already in the gallery.
 * - **The alternative text** of each photo is asked with a help, never required. Visitors' pages build
 *   their own text for a work (« Réalisation de … (2/5) »), so this text serves the photo library and
 *   her own space.
 * - The seven rules of the lists: L1 and L2 keys, L4 focus after a removal, L5 each removal and move is
 *   announced, L6 no duplicate, L7 Enter held acts once.
 */
export function GalleryBlock({
	photos,
	mainId,
	usage,
	save,
	saveMain,
	work,
	children,
}: {
	photos: readonly DashboardPhoto[]
	/** The photo that is her main photo now, if it is also in the gallery. */
	mainId: PhotoId | null
	usage?: PhotoUsageView | undefined
	save: PortfolioSave
	saveMain: MainPictureSave
	work?: GalleryWork
	/** The block as the visitor sees it, or `null` while there is nothing to show. */
	children: ReactNode | null
}) {
	return (
		<EditableBlock
			id="gallery"
			title="Portfolio"
			penLabel="Modifier mon portfolio"
			empty={children === null}
			shape="card"
			className="w-full min-w-0"
			penClassName="right-3 top-3"
			invitation={
				<span className="pr-8">
					<b className="text-lipstick">Ajoute des photos de tes réalisations.</b> Ce sont elles que les clientes
					regardent en premier.
				</span>
			}
			editor={
				<GalleryForm photos={photos} mainId={mainId} usage={usage} save={save} saveMain={saveMain} work={work ?? {}} />
			}
		>
			{children}
		</EditableBlock>
	)
}

function GalleryForm({
	photos,
	mainId,
	usage,
	save,
	saveMain,
	work,
}: {
	photos: readonly DashboardPhoto[]
	mainId: PhotoId | null
	usage: PhotoUsageView | undefined
	save: PortfolioSave
	saveMain: MainPictureSave
	work: GalleryWork
}) {
	const prepare = work.prepare ?? prepareBrowserPhoto
	const upload = work.upload ?? ((file: File, alt: string) => uploadPhoto(file, alt))
	const remove = work.remove ?? ((id: PhotoId) => deleteMedia(id))
	const patchAlt = work.changeAlt ?? ((id: PhotoId, alt: string) => changeAlt(id, alt))
	const counter = useRef(0)
	const [rows, setRows] = useState<Row[]>(() =>
		photos.map(photo => ({
			cle: `photo-${photo.id}`,
			fichier: new File([], ''),
			alt: photo.alt,
			storedAlt: photo.alt,
			id: photo.id,
			url: photo.url,
			preview: '',
			pending: false,
			signature: '',
		}))
	)
	const [main, setMain] = useState<PhotoId | null>(mainId)
	const [refusals, setRefusals] = useState<{ cle: string; text: string }[]>([])
	const [announcement, setAnnouncement] = useState({ phrase: '', rank: 0 })
	const [preparing, setPreparing] = useState(false)
	const buttons = useRef(new Map<string, HTMLElement>())
	const title = useRef<HTMLHeadingElement>(null)
	const picker = useRef<HTMLInputElement>(null)
	const current = useRef(rows)
	current.current = rows
	// Where the focus goes once the list is drawn again (L4 after a removal, the moved photo after a move).
	const after = useRef<{ target: string | null; keyboard: boolean } | null>(null)
	const gesture = useRef<'keyboard' | 'pointer'>('keyboard')

	// The local addresses are given back when the editor goes.
	useEffect(
		() => () => {
			for (const row of current.current) releasePreview(row.preview)
		},
		[]
	)

	useEffect(() => {
		const next = after.current
		if (next === null) return
		after.current = null
		const element = next.target === null ? undefined : buttons.current.get(next.target)
		if (element) element.focus()
		// Emptied: never a text field after a tap (it would open the keyboard of a phone).
		else if (!next.keyboard) title.current?.focus()
		else picker.current?.focus()
	}, [rows])

	const announce = (phrase: string) => setAnnouncement(({ rank }) => ({ phrase, rank: rank + 1 }))
	const nameOf = (rank: number, total: number) => `Photo ${rank} sur ${total} de ton portfolio`

	function removeRow(cle: string) {
		const rank = rows.findIndex(row => row.cle === cle)
		const removed = rows[rank]
		if (removed === undefined) return
		releasePreview(removed.preview)
		const remaining = rows.filter(row => row.cle !== cle)
		const next = remaining[rank] ?? remaining[rank - 1]
		after.current = {
			target: next === undefined ? null : `remove-${next.cle}`,
			keyboard: gesture.current === 'keyboard',
		}
		if (removed.id !== undefined && String(removed.id) === String(main)) setMain(null)
		setRows(remaining)
		setRefusals([])
		announce(`${nameOf(rank + 1, rows.length)} est retirée. Elle disparaît de ton portfolio quand tu enregistres.`)
	}

	function move(cle: string, step: -1 | 1) {
		const rank = rows.findIndex(row => row.cle === cle)
		const target = rank + step
		if (rank < 0 || target < 0 || target >= rows.length) return
		const next = [...rows]
		const [moved] = next.splice(rank, 1)
		if (moved === undefined) return
		next.splice(target, 0, moved)
		// The focus follows the photo: the same button when it can still be pressed, else the other one.
		const sameStillWorks = step === -1 ? target > 0 : target < next.length - 1
		const name = step === -1 ? 'earlier' : 'later'
		const other = step === -1 ? 'later' : 'earlier'
		after.current = { target: `${sameStillWorks ? name : other}-${cle}`, keyboard: true }
		setRows(next)
		announce(`Photo déplacée en position ${target + 1} sur ${rows.length}.`)
	}

	async function choose(files: File[]) {
		setPreparing(true)
		const refused: { cle: string; text: string }[] = []
		const refuse = (file: File, text: string) => {
			counter.current += 1
			refused.push({ cle: `refus-${counter.current}`, text: `${file.name} : ${text}` })
		}
		try {
			const accepted: Row[] = []
			const known = new Set(current.current.map(row => row.signature).filter(Boolean))
			for (const file of files) {
				if (current.current.length + accepted.length >= GALLERY_MAX) {
					refuse(file, MESSAGES_PHOTO['limite-galerie'])
					continue
				}
				// Her space holds a bounded number of photos (issue 309): the server decides, this says it before the send.
				const waiting = current.current.filter(row => row.pending).length + accepted.length
				if (usage && photosLeft(usage) - waiting <= 0) {
					refuse(file, MESSAGES_PHOTO['limite-profil'])
					continue
				}
				const signature = signatureOf(file)
				if (known.has(signature)) {
					refuse(file, MESSAGES_PHOTO.doublon)
					continue
				}
				const ready = await prepare(file)
				if (!ready.ok) {
					trackPhotoRefusal(localRefusalCause(ready))
					refuse(file, ready.message)
					continue
				}
				known.add(signature)
				counter.current += 1
				const preview = localPreview(ready.fichier)
				accepted.push({
					cle: `local-${counter.current}`,
					fichier: ready.fichier,
					alt: ALT_PORTFOLIO,
					storedAlt: '',
					url: preview,
					preview,
					pending: true,
					signature,
				})
			}
			if (accepted.length > 0) setRows(existing => [...existing, ...accepted])
			setRefusals(refused)
		} finally {
			setPreparing(false)
		}
	}

	const added = rows.filter(row => row.pending).length
	const kept = rows.length - added
	const sameOrder = rows.filter(row => !row.pending).every((row, rank) => row.id === photos[rank]?.id)
	const altChanged = rows.some(row => !row.pending && row.alt !== row.storedAlt)
	const changed =
		added > 0 || kept !== photos.length || !sameOrder || altChanged || String(main ?? '') !== String(mainId ?? '')

	return (
		<BlockForm
			title="Modifier mon portfolio"
			dirty={changed}
			disabled={!changed || preparing}
			keepsHint="tes photos sont toujours là"
			onSend={async () => {
				const issue = await sendThenSave<PortfolioValues>({
					photos: rows,
					televerser: async (file, alt) => {
						const result = await upload(file, alt)
						// A session that ended is not a refusal of the photo.
						if (!result.ok && result.session !== 'expiree') trackPhotoRefusal(result.cause ?? 'server')
						return result
					},
					supprimer: remove,
					enregistrer: async ids => {
						const result = await save({ galerie: ids })
						trackSave('portfolio', result)
						return result
					},
					marquerEnvoyee: (cle, id) =>
						setRows(existing => existing.map(row => (row.cle === cle ? { ...row, id } : row))),
				})
				if (!issue.ok) return { ...issue, message: issue.champs?.galerie ?? issue.message }
				// The text of a photo is a help, never a reason to refuse: a failure here is not told as a failure of the save.
				await Promise.all(
					rows.flatMap(row =>
						row.id !== undefined && !row.pending && row.alt !== row.storedAlt ? [patchAlt(row.id, row.alt)] : []
					)
				)
				if (main !== null && String(main) !== String(mainId ?? '')) {
					const result = await saveMain({ photoPrincipale: main }).catch(
						(): SaveResult<PhotoValues> => ({ ok: false, message: FAILURE_MESSAGE })
					)
					trackSave('photo', result)
					if (!result.ok)
						return {
							...result,
							message: `Ton portfolio est enregistré, mais ta photo principale n’a pas changé. ${result.message}`,
						}
				}
				return issue
			}}
		>
			<div
				className="flex flex-col gap-4"
				onKeyDownCapture={() => {
					gesture.current = 'keyboard'
				}}
				onPointerDownCapture={() => {
					gesture.current = 'pointer'
				}}
			>
				<h3 ref={title} tabIndex={-1} className="font-display font-medium text-xl outline-none">
					Photos de ton portfolio ({rows.length} / {GALLERY_MAX})
				</h3>
				<p role="status" data-testid="gallery-announcement" className="text-mute text-sm">
					{announcement.phrase}
				</p>
				{rows.length === 0 ? (
					<p className="text-mute text-sm">Tu n’as pas encore de photo dans ton portfolio.</p>
				) : (
					<ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{rows.map((row, rank) => {
							const isMain = row.id !== undefined && String(row.id) === String(main)
							const label = rank + 1
							return (
								<li
									key={row.cle}
									data-photo
									className="flex min-w-0 flex-col gap-3 rounded-2xl border border-hairline bg-blush p-3"
								>
									{/* biome-ignore lint/performance/noImgElement: a local preview of a file not sent yet cannot go through the image optimizer */}
									<img
										src={row.url || undefined}
										alt={nameOf(label, rows.length)}
										className="aspect-[4/5] w-full rounded-xl object-cover"
									/>
									<p className="flex flex-wrap gap-2 font-semibold text-xs">
										{row.pending ? <span className="text-warm">À enregistrer</span> : null}
										{isMain ? <span className="text-lipstick">Photo principale</span> : null}
									</p>
									<div className="flex flex-col gap-1">
										<label htmlFor={`alt-${row.cle}`} className="font-medium text-sm">
											Description de la photo {label}
										</label>
										<input
											id={`alt-${row.cle}`}
											type="text"
											autoComplete="off"
											value={row.alt}
											aria-describedby={`alt-help-${row.cle}`}
											onChange={event =>
												setRows(existing =>
													existing.map(other => (other.cle === row.cle ? { ...other, alt: event.target.value } : other))
												)
											}
											className="min-h-11 w-full rounded-2xl border-[1.5px] border-nude-300 bg-white px-4 py-2 text-base text-ink outline-none focus-visible:border-lipstick focus-visible:outline-2 focus-visible:outline-lipstick"
										/>
										<p id={`alt-help-${row.cle}`} className="text-mute text-xs">
											Dis ce qu’on voit, pour celles qui ne voient pas l’image. Facultatif.
										</p>
									</div>
									<div className="flex flex-wrap gap-2">
										<button
											type="button"
											ref={element => {
												if (element) buttons.current.set(`earlier-${row.cle}`, element)
												else buttons.current.delete(`earlier-${row.cle}`)
											}}
											aria-label={`Avancer la photo ${label}`}
											disabled={rank === 0}
											onKeyDown={event => event.repeat && event.preventDefault()}
											onClick={() => move(row.cle, -1)}
											className="min-h-11 min-w-11 rounded-full border border-ink bg-white px-4 font-semibold text-sm disabled:opacity-40"
										>
											<span aria-hidden="true">←</span> Avancer
										</button>
										<button
											type="button"
											ref={element => {
												if (element) buttons.current.set(`later-${row.cle}`, element)
												else buttons.current.delete(`later-${row.cle}`)
											}}
											aria-label={`Reculer la photo ${label}`}
											disabled={rank === rows.length - 1}
											onKeyDown={event => event.repeat && event.preventDefault()}
											onClick={() => move(row.cle, 1)}
											className="min-h-11 min-w-11 rounded-full border border-ink bg-white px-4 font-semibold text-sm disabled:opacity-40"
										>
											Reculer <span aria-hidden="true">→</span>
										</button>
										{row.id !== undefined && !row.pending ? (
											<button
												type="button"
												aria-pressed={isMain}
												aria-label={`Choisir la photo ${label} comme photo principale`}
												onKeyDown={event => event.repeat && event.preventDefault()}
												onClick={() => setMain(row.id ?? null)}
												className={`min-h-11 rounded-full border px-4 font-semibold text-sm ${isMain ? 'border-lipstick bg-lipstick text-white' : 'border-ink bg-white'}`}
											>
												Photo principale
											</button>
										) : null}
										<button
											type="button"
											ref={element => {
												if (element) buttons.current.set(`remove-${row.cle}`, element)
												else buttons.current.delete(`remove-${row.cle}`)
											}}
											aria-label={`Retirer la photo ${label}`}
											onKeyDown={event => event.repeat && event.preventDefault()}
											onClick={() => removeRow(row.cle)}
											className="min-h-11 rounded-full border border-hairline bg-white px-4 font-semibold text-sm"
										>
											Retirer
										</button>
									</div>
								</li>
							)
						})}
					</ul>
				)}
				<div className="flex flex-col gap-2">
					<div className="relative">
						<input
							ref={picker}
							id="direct-gallery-files"
							type="file"
							multiple
							accept={ACCEPT}
							disabled={preparing}
							aria-describedby="direct-gallery-help"
							className="peer sr-only"
							onChange={event => {
								const chosen = Array.from(event.target.files ?? [])
								// The same files can be picked again.
								event.target.value = ''
								if (chosen.length > 0) void choose(chosen)
							}}
						/>
						<label
							htmlFor="direct-gallery-files"
							className="flex min-h-14 w-full cursor-pointer items-center justify-center rounded-full border border-lipstick bg-white px-6 py-3 text-center font-semibold text-lipstick before:mr-2 before:content-['+'] peer-focus-visible:outline-2 peer-focus-visible:outline-lipstick peer-focus-visible:outline-offset-2 peer-disabled:opacity-60"
						>
							Ajouter des photos
						</label>
					</div>
					{usage ? <p className="text-mute text-sm">{usageSentence(usage)}</p> : null}
					<p id="direct-gallery-help" className="text-mute text-sm">
						JPEG, PNG ou WebP, {GALLERY_MAX} photos au plus. Les photos sont réduites avant l’envoi, et rien n’est
						envoyé avant « Enregistrer ».
					</p>
					{preparing ? (
						<p role="status" className="text-sm">
							Préparation des photos…
						</p>
					) : null}
					{refusals.length > 0 ? (
						<ul role="alert" className="list-disc pl-5 text-lipstick-800 text-sm">
							{refusals.map(({ cle, text }) => (
								<li key={cle}>{text}</li>
							))}
						</ul>
					) : null}
				</div>
			</div>
		</BlockForm>
	)
}
