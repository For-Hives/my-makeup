'use client'

import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { trackSave } from '@/lib/dashboard/analytics'
import type { LocationInput, LocationValues } from '@/lib/dashboard/location'
import { FAILURE_MESSAGE, type SaveResult } from '@/lib/dashboard/result'
import { choiceChanged, initialChoice, radiusAsked, type ZoneChoice, zoneRequest } from '@/lib/dashboard/zone-choice'
import type { ZoneReviewView } from '@/lib/dashboard/zone-review'
import type { CitiesSearch } from './CityField'
import { EditingPanel } from './EditingPanel'
import { ZoneFields, type ZoneFormValues, zoneResolver } from './ZoneFields'
import { ZoneReviewBanner } from './ZoneReviewBanner'

export type { LocationInput }

export type LocationUpload = (saisie: LocationInput) => Promise<SaveResult<LocationValues>>

const BUTTON = 'min-h-11 rounded-md px-4 py-2 font-medium'

/**
 * The button « Modifier » of the card of her location, and the panel it opens (tickets 123, 265
 * and 266): where she works, as a commune of the official list (by name or postal code) or as one
 * to five countries, her radius (0 to 200 km) and « à domicile ». Same contract as the identity
 * (ticket 119): the card changes once the server has answered, a failure keeps the old value and
 * says so, two clicks send one request, the result is announced outside the panel.
 *
 * - A commune is sent as its INSEE code and nothing else; countries as their codes and a town.
 *   Without a commune chosen in the list, nothing is sent and the field says so.
 * - The radius out of bounds, or not a whole number, is refused under the field, nothing sent.
 * - When the import left the zone to review, a banner under the button offers the communes of the
 *   postal code; a tap on one saves it, and the banner disappears.
 *
 * The functions that send and that search are properties: the page gives the server actions, a test
 * gives fakes.
 */
export function LocationEditor({
	valeurs,
	envoyer,
	chercher,
	revue = null,
}: {
	valeurs: LocationValues
	envoyer: LocationUpload
	chercher: CitiesSearch
	/** The zone to review the import left, or null. */
	revue?: ZoneReviewView | null
}) {
	const [open, setOpen] = useState(false)
	const [announcement, setAnnouncement] = useState('')
	const [review, setReview] = useState(revue)
	const [bannerPending, setBannerPending] = useState(false)
	const [bannerMessage, setBannerMessage] = useState('')
	const bannerLock = useRef(false)
	const trigger = useRef<HTMLButtonElement>(null)

	async function saveFromBanner(codeInsee: string) {
		if (bannerLock.current) return
		bannerLock.current = true
		setBannerPending(true)
		setBannerMessage('')
		try {
			const result = await envoyer({
				kind: 'city',
				codeInsee,
				rayonKm: valeurs.rayonKm,
				aDomicile: valeurs.aDomicile,
			}).catch((): SaveResult<LocationValues> => ({ ok: false, message: FAILURE_MESSAGE }))
			trackSave('localisation', result)
			if (result.ok) {
				setReview(null)
				setAnnouncement('Ta commune est enregistrée.')
				return
			}
			setBannerMessage(result.message)
		} finally {
			bannerLock.current = false
			setBannerPending(false)
		}
	}

	return (
		<>
			<button
				ref={trigger}
				type="button"
				aria-haspopup="dialog"
				aria-label="Modifier ma localisation"
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
			{review ? (
				<ZoneReviewBanner
					revue={review}
					enCours={bannerPending}
					message={bannerMessage}
					onChoisir={code => void saveFromBanner(code)}
				/>
			) : null}
			{open ? (
				<LocationForm
					valeurs={valeurs}
					envoyer={envoyer}
					chercher={chercher}
					retour={trigger}
					onEnregistre={() => {
						setAnnouncement('Ta localisation est enregistrée.')
						setReview(null)
						setOpen(false)
					}}
					onFermer={() => setOpen(false)}
				/>
			) : null}
		</>
	)
}

function LocationForm({
	valeurs,
	envoyer,
	chercher,
	retour,
	onEnregistre,
	onFermer,
}: {
	valeurs: LocationValues
	envoyer: LocationUpload
	chercher: CitiesSearch
	retour: React.RefObject<HTMLButtonElement | null>
	onEnregistre: () => void
	onFermer: () => void
}) {
	// The radius is checked only while it is asked: see `zoneResolver`.
	const radiusIsAsked = useRef(true)
	const [choice, setChoice] = useState<ZoneChoice>(() => initialChoice(valeurs))
	radiusIsAsked.current = radiusAsked(choice)
	const {
		register,
		handleSubmit,
		getValues,
		setError,
		formState: { errors, isDirty },
	} = useForm<ZoneFormValues>({
		resolver: zoneResolver(radiusIsAsked),
		defaultValues: { rayon: valeurs.rayonKm === null ? '' : String(valeurs.rayonKm), aDomicile: valeurs.aDomicile },
	})
	const [zoneError, setZoneError] = useState('')
	const [townError, setTownError] = useState('')
	const [pending, setPending] = useState(false)
	const [message, setMessage] = useState('')
	const lock = useRef(false)

	async function save(saisie: LocationInput) {
		setPending(true)
		setMessage('')
		try {
			const result = await envoyer(saisie).catch(
				(): SaveResult<LocationValues> => ({ ok: false, message: FAILURE_MESSAGE })
			)
			trackSave('localisation', result)
			if (result.ok) {
				onEnregistre()
				return
			}
			setMessage(result.message)
			setZoneError(result.champs?.codeInsee ?? result.champs?.countries ?? '')
			setTownError(result.champs?.town ?? '')
			if (result.champs?.rayonKm) setError('rayon', { message: result.champs.rayonKm })
			if (result.champs?.aDomicile) setError('aDomicile', { message: result.champs.aDomicile })
		} finally {
			lock.current = false
			setPending(false)
		}
	}

	return (
		<EditingPanel
			titre="Modifier ma localisation"
			enCours={pending}
			modifie={isDirty || choiceChanged(choice, valeurs)}
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
					const request = zoneRequest(choice, getValues('rayon'), getValues('aDomicile'))
					setZoneError(!request.ok && request.champ === 'zone' ? request.message : '')
					setTownError(!request.ok && request.champ === 'ville' ? request.message : '')
					void handleSubmit(
						() => {
							// Without a zone that can be sent, nothing is sent.
							if (!request.ok) {
								lock.current = false
								return undefined
							}
							return save(request.saisie)
						},
						() => {
							lock.current = false
						}
					)(evenement)
				}}
				className="flex flex-col gap-4"
			>
				<ZoneFields
					valeurs={valeurs}
					choix={choice}
					onChoix={next => {
						setChoice(next)
						setZoneError('')
						setTownError('')
					}}
					chercher={chercher}
					erreurZone={zoneError}
					erreurVille={townError}
					erreurRayon={errors.rayon?.message}
					register={register}
					rayonFacultatif={false}
				/>
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
