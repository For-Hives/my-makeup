'use client'

import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { LocationInput, LocationValues } from '@/lib/dashboard/location'
import { STEPS_TITLES } from '@/lib/dashboard/onboarding'
import { FAILURE_MESSAGE, type SaveResult } from '@/lib/dashboard/result'
import { initialChoice, radiusAsked, type ZoneChoice, zoneRequest } from '@/lib/dashboard/zone-choice'
import type { ZoneReviewView } from '@/lib/dashboard/zone-review'
import type { CitiesSearch } from '../CityField'
import type { LocationUpload } from '../LocationEditor'
import { ZoneFields, type ZoneFormValues, zoneResolver } from '../ZoneFields'
import { ZoneReviewBanner } from '../ZoneReviewBanner'
import { BUTTON, FailureMessage, MAIN_BUTTON, StepFrame } from './shared'

/**
 * The second step: her zone (tickets 140, 265 and 266). Where she works, as in the card of her
 * space and with the same component: a commune of the official list (by name or postal code, sent
 * as its code only), or one to five countries and a town, then her radius and « à domicile ».
 * « Précédent » goes back to the identity, whose values are not lost. The next step opens once the
 * server has stored the zone. When the import left the zone to review, a banner on top offers the
 * communes of her postal code, and a tap saves one like « Suivant » does.
 */
export function ZoneStep({
	valeurs,
	envoyer,
	chercher,
	titre,
	surFait,
	retour,
	revue = null,
}: {
	valeurs: LocationValues
	envoyer: LocationUpload
	chercher: CitiesSearch
	titre: React.RefObject<HTMLHeadingElement | null>
	surFait: (valeurs: LocationValues) => void
	retour: () => void
	/** The zone to review the import left, or null. */
	revue?: ZoneReviewView | null
}) {
	const radiusIsAsked = useRef(true)
	const [choice, setChoice] = useState<ZoneChoice>(() => initialChoice(valeurs))
	radiusIsAsked.current = radiusAsked(choice)
	const {
		register,
		handleSubmit,
		getValues,
		setError,
		formState: { errors },
	} = useForm<ZoneFormValues>({
		resolver: zoneResolver(radiusIsAsked),
		defaultValues: { rayon: valeurs.rayonKm === null ? '' : String(valeurs.rayonKm), aDomicile: valeurs.aDomicile },
	})
	const [zoneError, setZoneError] = useState('')
	const [townError, setTownError] = useState('')
	const [pending, setPending] = useState(false)
	const [message, setMessage] = useState('')
	const [bannerMessage, setBannerMessage] = useState('')
	const [expiredSession, setExpiredSession] = useState(false)
	const lock = useRef(false)

	async function save(saisie: LocationInput, depuisBandeau = false) {
		setPending(true)
		setMessage('')
		setBannerMessage('')
		setExpiredSession(false)
		try {
			const result = await envoyer(saisie).catch(
				(): SaveResult<LocationValues> => ({ ok: false, message: FAILURE_MESSAGE })
			)
			if (result.ok) {
				surFait(result.valeurs)
				return
			}
			setExpiredSession(result.session === 'expiree')
			if (depuisBandeau) setBannerMessage(result.message)
			else setMessage(result.message)
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
		<StepFrame
			titre={STEPS_TITLES[2]}
			explication="Dis-nous où tu travailles : seule ta commune ou ton pays apparaît sur ta page, jamais ton adresse."
			reference={titre}
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
				{revue ? (
					<ZoneReviewBanner
						revue={revue}
						enCours={pending}
						message={bannerMessage}
						onChoisir={codeInsee => {
							if (lock.current) return
							lock.current = true
							// The commune she taps, with the radius and « à domicile » as they stand in the form.
							const request = zoneRequest(
								{ kind: 'city', city: { codeInsee, libelle: codeInsee, nom: codeInsee } },
								getValues('rayon'),
								getValues('aDomicile')
							)
							if (!request.ok) {
								lock.current = false
								return
							}
							void save(request.saisie, true)
						}}
					/>
				) : null}
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
					rayonFacultatif
				/>
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
