import { Disclosure } from '@headlessui/react'
import { ChevronRightIcon } from '@heroicons/react/20/solid'
import React from 'react'

export function OptionsOffers(props) {
	const options = props.serviceOffer.options
	return (
		<div className={'flex w-full flex-col gap-2 py-2'}>
			{
				// display the user description
				// if \n is present, split the string and display each part in a new line
				options.map((option, index) => {
					return (
						<Disclosure key={index}>
							{({ open }) => (
								/* Use the `open` state to conditionally change the direction of an icon. */
								<>
									<Disclosure.Button
										className={
											'flex w-full items-center justify-between border-t border-slate-300 pt-6 ' +
											(open ? 'text-indigo-900' : 'pb-4 text-slate-700')
										}
									>
										{option.name}
										<ChevronRightIcon
											className={
												'h-6 w-6 ' + (open ? 'rotate-90 transform' : '')
											}
										/>
									</Disclosure.Button>
									<Disclosure.Panel>
										<div>
											{
												// display the user description
												// if \n is present, split the string and display each part in a new line
												option.description &&
													option.description
														.split('\n')
														.map((item_option, i) => {
															return (
																<p
																	key={i}
																	className={
																		'border-l border-slate-300 pl-4 text-slate-700 '
																	}
																>
																	{item_option}
																</p>
															)
														})
											}
										</div>
										<div
											className={
												'flex w-full flex-col items-end justify-center gap-2'
											}
										>
											{
												// display the user description
												// if \n is present, split the string and display each part in a new line
												option.price.split('\n').map((item_price, i) => {
													return (
														<h3
															key={i}
															className={
																'text-md flex justify-end rounded-full bg-slate-50 px-3 py-2 text-right italic text-slate-500'
															}
														>
															{item_price}
														</h3>
													)
												})
											}
										</div>
									</Disclosure.Panel>
								</>
							)}
						</Disclosure>
					)
				})
			}
		</div>
	)
}
