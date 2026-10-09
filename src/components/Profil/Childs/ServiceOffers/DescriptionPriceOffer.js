import React from 'react'
import { lignes } from '@/lib/profil/vue-publique'

/**
 * Display the description and the price of a service offer -> pass the service offer as props
 * One line per line typed; blank lines, « null » and an empty price render
 * nothing (UI-06: no empty <p> nor <h3> on a public page)
 * @param props
 * @returns {JSX.Element}
 * @constructor
 */
export function DescriptionPriceOffer(props) {
	const service_offer = props.serviceOffer
	const description = lignes(service_offer?.description)
	const prix = lignes(service_offer?.price)

	return (
		<div className={'flex flex-col gap-4'}>
			<div
				data-cy={
					props.index === null
						? `service-offer-description`
						: `service-offer-description-${props.index}`
				}
			>
				{description.map((ligne, i) => (
					<p key={i} className={'border-l border-gray-300 pl-4 text-gray-700'}>
						{ligne}
					</p>
				))}
			</div>
			<div
				className={'flex w-full flex-col items-end justify-center gap-2'}
				data-cy={
					props.index === null
						? `service-offer-price`
						: `service-offer-price-${props.index}`
				}
			>
				{prix.map((ligne, i) => (
					<h3
						key={i}
						className={
							'text-md flex justify-end rounded-full bg-gray-50 px-3 py-2 text-right italic text-gray-500'
						}
					>
						{ligne}
					</h3>
				))}
			</div>
		</div>
	)
}
