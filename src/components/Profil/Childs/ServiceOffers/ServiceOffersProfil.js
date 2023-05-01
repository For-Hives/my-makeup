import React from 'react'
import { OptionsOffers } from '@/components/Profil/Childs/ServiceOffers/OptionsOffers'
import { DescriptionPriceOffer } from '@/components/Profil/Childs/ServiceOffers/DescriptionPriceOffer'
import { Tab } from '@headlessui/react'

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
			<Tab.Group>
				<Tab.List className={'flex w-full justify-center py-4'}>
					{user?.service_offers.map((service_offer, index) => {
						return (
							<Tab
								key={index}
								className={
									'h-full w-full border-b border-slate-300 bg-slate-50/30 p-4 text-xs text-slate-600 hover:bg-slate-50/50 focus:outline-none ' +
									// 	aria selected
									' aria-selected:border-b-2 aria-selected:border-indigo-800 aria-selected:font-semibold aria-selected:text-slate-900'
								}
							>
								{service_offer.name}
							</Tab>
						)
					})}
				</Tab.List>
				<Tab.Panels>
					{user?.service_offers.map((service_offer, index) => {
						return (
							<Tab.Panel key={index}>
								<div className={'flex flex-col gap-4 bg-white py-4'}>
									<div className={'flex flex-col'}>
										<h2
											className={'text-start text-lg font-bold text-indigo-900'}
										>
											{service_offer.name}
										</h2>
									</div>
									<DescriptionPriceOffer serviceOffer={service_offer} />
								</div>
								<div className={'flex w-full flex-col gap-2 py-2'}>
									<OptionsOffers serviceOffer={service_offer} />
								</div>
							</Tab.Panel>
						)
					})}
				</Tab.Panels>
			</Tab.Group>
		</div>
	)
}
