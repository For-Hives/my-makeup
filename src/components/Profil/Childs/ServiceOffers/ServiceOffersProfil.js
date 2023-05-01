import React from 'react'
import { OptionsOffers } from '@/components/Profil/Childs/ServiceOffers/OptionsOffers'
import { DescriptionPriceOffer } from '@/components/Profil/Childs/ServiceOffers/DescriptionPriceOffer'

export function ServiceOffersProfil(props) {
	const user = props.user
	return (
		<div
			className={
				'flex w-full flex-col gap-4 rounded border border-slate-300 bg-white p-8'
			}
		>
			<h2 className={'text-xl font-bold text-slate-700'}>
				Service(s) proposé(s)
			</h2>
			{/*	map on service_offers name, description, price */}
			{/*	options : repetable : name / description / price */}
			<div className={'grid w-full grid-cols-1 gap-4'}>
				{user?.service_offers.map((service_offer, index) => {
					return (
						<>
							<div key={index} className={'flex flex-col gap-4 bg-white py-4'}>
								<div className={'flex flex-col'}>
									<h2
										className={'text-start text-lg font-bold text-indigo-900'}
									>
										‣ {service_offer.name}
									</h2>
								</div>
								<DescriptionPriceOffer serviceOffer={service_offer} />
							</div>
							<div className={'flex w-full flex-col gap-2 py-2'}>
								<OptionsOffers serviceOffer={service_offer} />
							</div>
						</>
					)
				})}
			</div>
		</div>
	)
}
