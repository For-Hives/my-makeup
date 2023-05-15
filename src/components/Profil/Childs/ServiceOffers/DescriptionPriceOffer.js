import React from 'react'

/**
 * Display the description and the price of a service offer -> pass the service offer as props
 * @param props
 * @returns {JSX.Element}
 * @constructor
 */
export function DescriptionPriceOffer(props) {
	const service_offer = props.serviceOffer
	return (
		<div className={'flex flex-col gap-4'}>
			<div>
				{
					// display the user description
					// if \n is present, split the string and display each part in a new line
					service_offer.description &&
						service_offer.description.split('\n').map((item, i) => {
							return (
								<p
									key={i}
									className={'border-l border-slate-300 pl-4 text-slate-700 '}
								>
									{item}
								</p>
							)
						})
				}
			</div>
			<div className={'flex w-full flex-col items-end justify-center gap-2'}>
				{
					// display the user description
					// if \n is present, split the string and display each part in a new line
					service_offer.price &&
						service_offer.price.split('\n').map((item, i) => {
							return (
								<h3
									key={i}
									className={
										'text-md flex justify-end rounded-full bg-slate-50 px-3 py-2 text-right italic text-slate-500'
									}
								>
									{item}
								</h3>
							)
						})
				}
			</div>
		</div>
	)
}
