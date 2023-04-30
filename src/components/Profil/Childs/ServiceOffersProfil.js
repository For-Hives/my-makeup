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
			<div className={'grid w-full grid-cols-2 gap-4'}>
				{user?.service_offers.map((service_offer, index) => {
					return (
						<div
							key={index}
							className={
								'flex flex-col gap-2 rounded border border-slate-300 bg-white p-8 shadow-xl'
							}
						>
							<div className={'flex justify-between'}>
								<h2 className={'text-md mr-4 font-bold text-indigo-900'}>
									{service_offer.name}
								</h2>
								<h2
									className={
										'text-md flex items-center justify-center rounded-full bg-indigo-50 px-3 py-2 text-indigo-900'
									}
								>
									{service_offer.price}&nbsp;€
								</h2>
							</div>
							<p className={'text-slate-700'}>{service_offer.description}</p>
						</div>
					)
				})}
			</div>
		</div>
	)
}
