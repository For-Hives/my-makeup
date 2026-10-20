'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { trackSave } from '@/lib/dashboard/analytics'
import {
	CITY_TO_CHOOSE_MESSAGE,
	enteredRadiusSchema,
	type LocationValues,
	type SuggestedCity,
	textRadius,
} from '@/lib/dashboard/location'
import { FAILURE_MESSAGE, type SaveResult } from '@/lib/dashboard/result'
import { BORNES_DU_RAYON_KM } from '@/lib/profile/zone'
import { type CitiesSearch, CityField } from './CityField'
import { EditingPanel } from './EditingPanel'

/** What is sent: the code of the commune she chose, the radius, « à domicile ». Never a name. */
export type LocationInput = { codeInsee: string; rayonKm: number | null; aDomicile: boolean }

export type LocationUpload = (saisie: LocationInput) => Promise<SaveResult<LocationValues>>

const BUTTON = 'min-h-11 rounded-md px-4 py-2 font-medium'
const FIELD = 'min-h-11 rounded-md border border-neutral-400 bg-white px-3 py-2 text-base'

const formSchema = z.object({ rayon: enteredRadiusSchema, aDomicile: z.boolean() })
type FormValues = z.infer<typeof formSchema>

/**
 * The button « Modifier » of the card of her location, and the panel it opens (ticket 123): her
 * commune, chosen in the official list, her radius (0 to 200 km) and « à domicile ». Same contract as
 * the identity (ticket 119): the card changes once the server has answered, a failure keeps the old
 * value and says so, two clicks send one request, the result is announced outside the panel.
 *
 * - The commune is sent as its INSEE code and nothing else. Without a commune chosen in the list,
 *   nothing is sent and the field says so.
 * - The radius out of bounds, or not a whole number, is refused under the field, nothing sent.
 *
 * The functions that send and that search are properties: the page gives the server actions, a test
 * gives fakes.
 */
export function LocationEditor({
	valeurs,
	envoyer,
	chercher,
}: {
	valeurs: LocationValues
	envoyer: LocationUpload
	chercher: CitiesSearch
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
			{open ? (
				<LocationForm
					valeurs={valeurs}
					envoyer={envoyer}
					chercher={chercher}
					retour={trigger}
					onEnregistre={() => {
						setAnnouncement('Ta localisation est enregistrée.')
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
	const id = useId()
	const {
		register,
		handleSubmit,
		setError,
		formState: { errors, isDirty },
	} = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: { rayon: valeurs.rayonKm === null ? '' : String(valeurs.rayonKm), aDomicile: valeurs.aDomicile },
	})
	// The commune chosen: the one stored at first, then the one she picks; null once she types again.
	const [chosen, setChosen] = useState<SuggestedCity | null>(
		valeurs.codeInsee === '' ? null : { codeInsee: valeurs.codeInsee, libelle: valeurs.libelle }
	)
	const [cityError, setCityError] = useState('')
	const [pending, setPending] = useState(false)
	const [message, setMessage] = useState('')
	const lock = useRef(false)
	const changedCity = (chosen?.codeInsee ?? '') !== valeurs.codeInsee

	async function save(saisie: FormValues, commune: SuggestedCity) {
		setPending(true)
		setMessage('')
		try {
			const result = await envoyer({
				codeInsee: commune.codeInsee,
				rayonKm: textRadius(saisie.rayon),
				aDomicile: saisie.aDomicile,
			}).catch((): SaveResult<LocationValues> => ({ ok: false, message: FAILURE_MESSAGE }))
			trackSave('localisation', result)
			if (result.ok) {
				onEnregistre()
				return
			}
			setMessage(result.message)
			if (result.champs?.codeInsee) setCityError(result.champs.codeInsee)
			if (result.champs?.rayonKm) setError('rayon', { message: result.champs.rayonKm })
			if (result.champs?.aDomicile) setError('aDomicile', { message: result.champs.aDomicile })
		} finally {
			lock.current = false
			setPending(false)
		}
	}

	const radiusError = errors.rayon?.message

	return (
		<EditingPanel
			titre="Modifier ma localisation"
			enCours={pending}
			modifie={isDirty || changedCity}
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
					const city = chosen
					setCityError(city === null ? CITY_TO_CHOOSE_MESSAGE : '')
					void handleSubmit(
						saisie => {
							// Without a commune chosen, nothing is sent.
							if (city === null) {
								lock.current = false
								return undefined
							}
							return save(saisie, city)
						},
						() => {
							lock.current = false
						}
					)(evenement)
				}}
				className="flex flex-col gap-4"
			>
				<div className="flex flex-col gap-1">
					<label htmlFor={`${id}-commune`} className="font-medium text-sm">
						Ta commune
					</label>
					<CityField
						id={`${id}-commune`}
						idErreur={`${id}-commune-erreur`}
						libelleInitial={valeurs.libelle}
						chercher={chercher}
						erreur={cityError}
						onChoisir={commune => {
							setChosen(commune)
							if (commune !== null) setCityError('')
						}}
					/>
				</div>
				<div className="flex flex-col gap-1">
					<label htmlFor={`${id}-rayon`} className="font-medium text-sm">
						Rayon d’action (en km)
					</label>
					<input
						id={`${id}-rayon`}
						type="text"
						inputMode="numeric"
						autoComplete="off"
						aria-invalid={radiusError ? true : undefined}
						aria-describedby={`${id}-rayon-aide${radiusError ? ` ${id}-rayon-erreur` : ''}`}
						className={`${FIELD} w-32`}
						{...register('rayon')}
					/>
					<p id={`${id}-rayon-aide`} className="text-neutral-700 text-sm">
						De {BORNES_DU_RAYON_KM.min} à {BORNES_DU_RAYON_KM.max} km, en kilomètres entiers. Tu peux laisser vide.
					</p>
					{radiusError ? (
						<p id={`${id}-rayon-erreur`} className="text-red-800 text-sm">
							{radiusError}
						</p>
					) : null}
				</div>
				<div className="flex items-center gap-3">
					<input
						id={`${id}-domicile`}
						type="checkbox"
						className="size-6 shrink-0 accent-neutral-900"
						{...register('aDomicile')}
					/>
					<label htmlFor={`${id}-domicile`} className="min-h-11 flex-1 content-center font-medium text-sm">
						Je me déplace à domicile
					</label>
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
