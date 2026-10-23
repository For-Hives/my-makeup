'use client'

import type { ReactNode } from 'react'
import type { LocationValues } from '@/lib/dashboard/location'
import type { ZoneReviewView } from '@/lib/dashboard/zone-review'
import type { CitiesSearch } from '../../dashboard/CityField'
import { EditableBlock } from '../EditableBlock'
import { PlaceForm, type PlaceSave } from './PlaceBlock'

/**
 * Where she travels, in the sentence of her page (« Se déplace à domicile, jusqu’à 30 km d’Annecy »),
 * edited in place (issue 1019). It is the same zone as the one of the header, so the same form and the
 * same server action: one field (commune, postal code or country), countries as chips, the radius and
 * « à domicile ». The zone is a commune and a radius, never an address, and the server reads it as the
 * dashboard does (`zoneRequest`, `saveMyLocation`): the distance search follows the commune stored.
 *
 * A zone left to review by the import is told by the placeholder, not by a banner of its own.
 */
export function TravelBlock({
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
	/** The sentence as the visitor reads it, or `null` while she does not travel. */
	children: ReactNode | null
}) {
	return (
		<EditableBlock
			id="travel"
			title="Mes déplacements"
			penLabel="Modifier mes déplacements"
			empty={children === null}
			shape="card"
			className="w-full min-w-0"
			penClassName="right-3 top-3"
			invitation={
				review ? (
					<span className="pr-8">
						<b className="text-lipstick">Ta zone est à revoir.</b> Dis si tu te déplaces, et jusqu’où.
					</span>
				) : (
					<span className="pr-8">
						<b className="text-lipstick">Dis si tu te déplaces.</b> Ta commune et le nombre de kilomètres, jamais ton
						adresse.
					</span>
				)
			}
			editor={
				<PlaceForm title="Modifier mes déplacements" values={values} save={save} search={search} review={review} />
			}
		>
			{children}
		</EditableBlock>
	)
}
