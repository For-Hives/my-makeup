'use client'

import { type ReactNode, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { trackSave } from '@/lib/dashboard/analytics'
import type { LocationInput, LocationValues } from '@/lib/dashboard/location'
import { FAILURE_MESSAGE, type SaveResult } from '@/lib/dashboard/result'
import { choiceChanged, initialChoice, radiusAsked, type ZoneChoice, zoneRequest } from '@/lib/dashboard/zone-choice'
import type { ZoneReviewView } from '@/lib/dashboard/zone-review'
import type { CitiesSearch } from '../../dashboard/CityField'
import { ZoneFields, type ZoneFormValues, zoneResolver } from '../../dashboard/ZoneFields'
import { ZoneReviewBanner } from '../../dashboard/ZoneReviewBanner'
import { BlockForm } from '../BlockForm'
import { EditableBlock } from '../EditableBlock'
import { useEditSession } from '../EditSession'

export type PlaceSave = (saisie: LocationInput) => Promise<SaveResult<LocationValues>>

/**
 * Her place in the header (her commune, or her countries), edited in place (issue 1008). The single
 * field of the zone (commune, postal code or country) is the one of her space: same component, same
 * checks as the server (`zoneRequest`), the commune sent as its INSEE code and nothing else. The radius
 * and « à domicile » that field carries are kept as they are stored when she does not touch them;
 * the dedicated block of the travels is the issue 1019.
 *
 * When the import left the zone to review, its banner is at the top of the editor: a tap on a commune
 * saves it.
 */
export function PlaceBlock({
	values,
	save,
	search,
	review = null,
	children,
}: {
	values: LocationValues
	save: PlaceSave
	search: CitiesSearch
	review?: ZoneReviewView | null
	/** The place as the visitor sees it, or nothing when she gave none. */
	children: ReactNode
}) {
	const empty = values.kind === 'city' ? values.codeInsee === '' : values.countries.length === 0
	return (
		<EditableBlock
			id="place"
			title="Où je travaille"
			penLabel="Modifier ma zone"
			empty={empty}
			shape="card"
			className="mt-2 max-w-full"
			penClassName="-right-3 -top-3"
			invitation={
				review ? (
					<span className="pr-8">
						<b className="text-lipstick">Ta zone est à revoir.</b> Choisis ta commune pour qu’on te trouve.
					</span>
				) : (
					<span className="pr-8">
						<b className="text-lipstick">Dis où tu travailles.</b> Ta commune ou ton pays, pour qu’on te trouve.
					</span>
				)
			}
			editor={<PlaceForm values={values} save={save} search={search} review={review} />}
		>
			<div className="flex min-h-11 items-center pr-10 [&>p]:mt-0">{children}</div>
		</EditableBlock>
	)
}

export function PlaceForm({
	values,
	save,
	search,
	review,
	title = 'Modifier ma zone',
	submitLabel,
	cancel,
	rayonFacultatif = false,
}: {
	title?: string
	submitLabel?: string
	cancel?: ReactNode
	/** The radius may stay empty (the commune alone is enough). */
	rayonFacultatif?: boolean
	values: LocationValues
	save: PlaceSave
	search: CitiesSearch
	review: ZoneReviewView | null
}) {
	const session = useEditSession()
	// The radius is checked only while it is asked: see `zoneResolver`.
	const radiusIsAsked = useRef(true)
	const [choice, setChoice] = useState<ZoneChoice>(() => initialChoice(values))
	radiusIsAsked.current = radiusAsked(choice)
	const {
		register,
		handleSubmit,
		getValues,
		setError,
		formState: { errors, isDirty },
	} = useForm<ZoneFormValues>({
		resolver: zoneResolver(radiusIsAsked),
		defaultValues: { rayon: values.rayonKm === null ? '' : String(values.rayonKm), aDomicile: values.aDomicile },
	})
	const [zoneError, setZoneError] = useState('')
	const [townError, setTownError] = useState('')
	const [bannerPending, setBannerPending] = useState(false)
	const [bannerMessage, setBannerMessage] = useState('')
	const bannerLock = useRef(false)

	async function fromBanner(codeInsee: string) {
		if (bannerLock.current) return
		bannerLock.current = true
		setBannerPending(true)
		setBannerMessage('')
		try {
			const result = await save({
				kind: 'city',
				codeInsee,
				rayonKm: values.rayonKm,
				aDomicile: values.aDomicile,
			}).catch((): SaveResult<LocationValues> => ({ ok: false, message: FAILURE_MESSAGE }))
			trackSave('localisation', result)
			if (result.ok) session.saved()
			else setBannerMessage(result.message)
		} finally {
			bannerLock.current = false
			setBannerPending(false)
		}
	}

	return (
		<BlockForm
			title={title}
			{...(submitLabel === undefined ? {} : { submitLabel })}
			{...(cancel === undefined ? {} : { cancel })}
			dirty={isDirty || choiceChanged(choice, values)}
			keepsHint="ta saisie est toujours là"
			onFailure={failure => {
				setZoneError(failure.fields?.codeInsee ?? failure.fields?.countries ?? '')
				setTownError(failure.fields?.town ?? '')
				if (failure.fields?.rayonKm) setError('rayon', { message: failure.fields.rayonKm })
				if (failure.fields?.aDomicile) setError('aDomicile', { message: failure.fields.aDomicile })
			}}
			onSend={() =>
				new Promise(resolve => {
					const request = zoneRequest(choice, getValues('rayon'), getValues('aDomicile'))
					setZoneError(!request.ok && request.champ === 'zone' ? request.message : '')
					setTownError(!request.ok && request.champ === 'ville' ? request.message : '')
					void handleSubmit(
						async () => {
							// Without a zone that can be sent, nothing is sent.
							if (!request.ok) return resolve(null)
							const result = await save(request.saisie).catch(
								(): SaveResult<LocationValues> => ({ ok: false, message: FAILURE_MESSAGE })
							)
							trackSave('localisation', result)
							resolve(result)
						},
						() => resolve(null)
					)()
				})
			}
		>
			{review ? (
				<ZoneReviewBanner
					revue={review}
					enCours={bannerPending}
					message={bannerMessage}
					onChoisir={code => void fromBanner(code)}
				/>
			) : null}
			<ZoneFields
				valeurs={values}
				choix={choice}
				onChoix={next => {
					setChoice(next)
					setZoneError('')
					setTownError('')
				}}
				chercher={search}
				erreurZone={zoneError}
				erreurVille={townError}
				erreurRayon={errors.rayon?.message}
				register={register}
				rayonFacultatif={rayonFacultatif}
			/>
		</BlockForm>
	)
}
