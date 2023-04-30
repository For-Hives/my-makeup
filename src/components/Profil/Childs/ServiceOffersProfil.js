import React from 'react'

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
			{user.service_offers.map((service_offer, index) => {
				return (
					<div key={index} className={'flex w-full flex-col gap-2'}>
						<div className={'flex justify-between'}>
							<h2 className={'text-lg font-bold text-indigo-900'}>
								{service_offer.name}
							</h2>
							<h2 className={'text-lg text-slate-700'}>
								{service_offer.price} €
							</h2>
						</div>
						<p className={'text-slate-700'}>{service_offer.description}</p>
					</div>
				)
			})}
			<div className={'flex w-full flex-col'}>
				<div className={'flex justify-between'}>
					<h2></h2>
				</div>
				<div></div>
			</div>
			<div className={'pl-8'}></div>
		</div>
	)
}
