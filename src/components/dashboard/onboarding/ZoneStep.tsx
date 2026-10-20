'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import {
	CITY_TO_CHOOSE_MESSAGE,
	enteredRadiusSchema,
	type LocationValues,
	type SuggestedCity,
	textRadius,
} from '@/lib/dashboard/location'
import { STEPS_TITLES } from '@/lib/dashboard/onboarding'
import { FAILURE_MESSAGE, type SaveResult } from '@/lib/dashboard/result'
import { BORNES_DU_RAYON_KM } from '@/lib/profil/zone'
import { type CitiesSearch, CityField } from '../CityField'
import type { LocationUpload } from '../LocationEditor'
import { BUTTON, FailureMessage, FIELD, MAIN_BUTTON, StepFrame } from './shared'

const formSchema = z.object({ rayon: enteredRadiusSchema, aDomicile: z.boolean() })
type FormValues = z.infer<typeof formSchema>

/**
 * The second step: her zone (ticket 140). Her commune, chosen in the official list and sent as its
 * code only, her radius and « à domicile », as in the card of her space. « Précédent » goes back to
 * the identity, whose values are not lost. The next step opens once the server has stored the zone.
 */
export function ZoneStep({
	valeurs,
	envoyer,
	chercher,
	titre,
	surFait,
	retour,
}: {
	valeurs: LocationValues
	envoyer: LocationUpload
	chercher: CitiesSearch
	titre: React.RefObject<HTMLHeadingElement | null>
	surFait: (valeurs: LocationValues) => void
	retour: () => void
}) {
	const id = useId()
	const {
		register,
		handleSubmit,
		setError,
		formState: { errors },
	} = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: { rayon: valeurs.rayonKm === null ? '' : String(valeurs.rayonKm), aDomicile: valeurs.aDomicile },
	})
	const [chosen, setChosen] = useState<SuggestedCity | null>(
		valeurs.codeInsee === '' ? null : { codeInsee: valeurs.codeInsee, libelle: valeurs.libelle }
	)
	const [cityError, setCityError] = useState('')
	const [pending, setPending] = useState(false)
	const [message, setMessage] = useState('')
	const [expiredSession, setExpiredSession] = useState(false)
	const lock = useRef(false)

	async function save(saisie: FormValues, commune: SuggestedCity) {
		setPending(true)
		setMessage('')
		setExpiredSession(false)
		try {
			const result = await envoyer({
				codeInsee: commune.codeInsee,
				rayonKm: textRadius(saisie.rayon),
				aDomicile: saisie.aDomicile,
			}).catch((): SaveResult<LocationValues> => ({ ok: false, message: FAILURE_MESSAGE }))
			if (result.ok) {
				surFait(result.valeurs)
				return
			}
			setExpiredSession(result.session === 'expiree')
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
		<StepFrame
			titre={STEPS_TITLES[2]}
			explication="Dis-nous où tu travailles : seule ta commune apparaît sur ta page, jamais ton adresse."
			reference={titre}
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
							// Without a commune chosen in the list, nothing is sent.
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
						Rayon d’action (en km) <span className="font-normal text-neutral-600">(facultatif)</span>
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
						De {BORNES_DU_RAYON_KM.min} à {BORNES_DU_RAYON_KM.max} km, en kilomètres entiers.
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
					<button type="submit" disabled={pending} className={MAIN_BUTTON}>
						{pending ? 'Enregistrement…' : 'Suivant'}
					</button>
				</div>
			</form>
		</StepFrame>
	)
}
