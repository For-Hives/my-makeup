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
				<Tab.List
					className={
						'flex w-full justify-center gap-8 rounded-xl bg-indigo-900/10 p-2'
					}
				>
					{user?.service_offers.map((service_offer, index) => {
						return (
							<Tab
								key={index}
								className={
									'btn-primary ring-offset border-none  text-xs font-medium text-slate-700 outline-none ring-indigo-800 hover:bg-slate-700/10 focus:outline-none focus:ring-2' +
									// 	aria selected
									' bg-indigo-900/0 aria-selected:bg-white aria-selected:text-indigo-900/100'
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
