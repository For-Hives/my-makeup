import React, { Fragment, useEffect, useRef, useState } from 'react'
import { Dialog, Tab, Transition } from '@headlessui/react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import { useSession } from 'next-auth/react'
import * as yup from 'yup'
import { useQueryClient } from '@tanstack/react-query'
import { patchMeMakeup } from '@/services/PatchMeMakeup'
import { DescriptionPriceOffer } from '@/components/Profil/Childs/ServiceOffers/DescriptionPriceOffer'
import { OptionsOffers } from '@/components/Profil/Childs/ServiceOffers/OptionsOffers'

const schema = yup.object().shape({
	name: yup.string().required("Le nom de l'entreprise est requise"),
	price: yup.string().required('Le prix de la préstation est requise'),
	description: yup.string().required('La description est requise'),
})

/**
 * ModalUpdateServiceOffersProfil
 * @param props
 * @constructor
 */
export default function ModalUpdateServiceOffersProfil(props) {
	const queryClient = useQueryClient()

	const user = props.user

	const {
		register,
		handleSubmit,
		formState: { errors },
		reset,
	} = useForm({
		resolver: yupResolver(schema),
	})

	const [open, setOpen] = useState(props.modalUpdateServiceOffersProfil)

	const [userServiceOffers, setUserServiceOffers] = useState(
		user.service_offers
	)
	const [userServiceOffersName, setUserServiceOffersName] = useState('')
	const [userServiceOffersPrice, setUserServiceOffersPrice] = useState('')
	const [userServiceOffersDescription, setUserServiceOffersDescription] =
		useState('')
	const [userServiceOffersOptions, setUserServiceOffersOptions] = useState([])

	const { data: session } = useSession()

	/**
	 * onSubmit function called when the form is submitted
	 * @param data
	 */
	const onSubmit = data => {
		// add a new experience to the user serviceOffers only if the form is valid
		if (data) {
			console.log('data', data)
			console.log('userServiceOffers', userServiceOffers)
			setUserServiceOffers([
				...userServiceOffers,
				{
					id: 'added' + data.name + data.price,
					name: data.name,
					price: data.price,
					description: data.description,
					options: userServiceOffersOptions,
				},
			])
			console.log('userServiceOffers', userServiceOffers)
			// reset the form
			setUserServiceOffersName('')
			setUserServiceOffersPrice('')
			setUserServiceOffersDescription('')
			setUserServiceOffersOptions([])

			reset()
		}
	}

	const handleSubmitServiceOffers = event => {
		// copy userServiceOffers to data, but remove the id field (only if the id start by "added"),
		// and in the options array, remove the id field on each object too (only if the id start by "added")
		const userServiceOffersCopy = userServiceOffers.map(serviceOffer => {
			if (serviceOffer.id.toString().startsWith('added')) {
				const options = serviceOffer.options.map(option => {
					if (option.id.toString().startsWith('added')) {
						return {
							name: option.name,
							price: option.price,
							description: option.description,
						}
					} else {
						return option
					}
				})
				return {
					name: serviceOffer.name,
					price: serviceOffer.price,
					description: serviceOffer.description,
					options: options,
				}
			} else {
				const options = serviceOffer.options.map(option => {
					if (option.id.toString().startsWith('added')) {
						return {
							name: option.name,
							price: option.price,
							description: option.description,
						}
					} else {
						return option
					}
				})
				return {
					id: serviceOffer.id,
					name: serviceOffer.name,
					price: serviceOffer.price,
					description: serviceOffer.description,
					options: options,
				}
			}
		})

		console.log('userServiceOffersCopy', userServiceOffersCopy)

		// set data
		const data = {
			service_offers: userServiceOffersCopy,
		}
		console.log('data', data)
		patchMeMakeup(queryClient, user, session, data)
		// close the modal & reset the yup form
		setUserServiceOffersName('')
		setUserServiceOffersPrice('')
		setUserServiceOffersDescription('')
		setUserServiceOffersOptions([])
		reset()
		props.handleModalUpdateServiceOffersProfil()
	}

	useEffect(() => {
		setOpen(props.modalUpdateServiceOffersProfil)
	}, [props.modalUpdateServiceOffersProfil])

	const cancelButtonRef = useRef(null)
	const inputRef = useRef(null)

	const handleClick = event => {
		// 👇️ open file input box on click of another element
		// 👇️ trigger click event on input element to open file dialog
		inputRef.current.click()
	}

	const handleUpdateServiceOffersName = event => {
		setUserServiceOffersName(event.target.value)
	}

	const handleUpdateServiceOffersPrice = event => {
		setUserServiceOffersPrice(event.target.value)
	}

	const handleUpdateServiceOffersDescription = event => {
		setUserServiceOffersDescription(event.target.value)
	}

	const handleDeleteExperience = id => {
		const userServiceOffersFiltered = userServiceOffers.filter(
			experience => experience.id !== id
		)
		setUserServiceOffers(userServiceOffersFiltered)
	}

	const handleAddServiceOffersOption = () => {
		const userServiceOffersOptionsUpdated = [
			...userServiceOffersOptions,
			{
				id: 'added' + userServiceOffersOptions.length,
				name: '',
				price: '',
				description: '',
			},
		]

		setUserServiceOffersOptions(userServiceOffersOptionsUpdated)
		console.log('userServiceOffersOptionsUpdated', userServiceOffersOptions)
	}

	// reset the form when the modal is closed
	useEffect(() => {
		if (!open) {
			setUserServiceOffers(user.service_offers)
			setUserServiceOffersName('')
			setUserServiceOffersPrice('')
			setUserServiceOffersDescription('')
			setUserServiceOffersOptions([])
			reset()
		}
	}, [open, reset, user.service_offers])

	return (
		<Transition.Root show={open} as={Fragment}>
			<Dialog
				as="div"
				className="relative z-30"
				initialFocus={cancelButtonRef}
				onClose={props.handleModalUpdateServiceOffersProfil}
			>
				<Transition.Child
					as={Fragment}
					enter="ease-out duration-300"
					enterFrom="opaserviceOffers-0"
					enterTo="opaserviceOffers-100"
					leave="ease-in duration-200"
					leaveFrom="opaserviceOffers-100"
					leaveTo="opaserviceOffers-0"
				>
					<div className="bg-opaserviceOffers-75 transition-opaserviceOffers fixed inset-0 bg-slate-500" />
				</Transition.Child>

				<div className="fixed inset-0 z-30 overflow-y-auto">
					<div className="flex min-h-full items-center justify-center p-4 text-center">
						<Transition.Child
							as={Fragment}
							enter="ease-out duration-300"
							enterFrom="opaserviceOffers-0 translate-y-4 sm:translate-y-0 sm:scale-95"
							enterTo="opaserviceOffers-100 translate-y-0 sm:scale-100"
							leave="ease-in duration-200"
							leaveFrom="opaserviceOffers-100 translate-y-0 sm:scale-100"
							leaveTo="opaserviceOffers-0 translate-y-4 sm:translate-y-0 sm:scale-95"
						>
							<Dialog.Panel className="relative w-full transform rounded-lg bg-white p-8 text-left shadow-2xl transition-all sm:max-w-7xl">
								<button
									type="button"
									onClick={props.handleModalUpdateServiceOffersProfil}
									ref={cancelButtonRef}
									className={
										'absolute right-0 top-0 m-6 flex items-center justify-center'
									}
								>
									<span className="material-icons-round">close</span>
								</button>
								<div className="flex flex-col items-start gap-8">
									<div className="text-left">
										<Dialog.Title
											as="h3"
											className="text-lg font-semibold text-slate-900"
										>
											Les expériences professionnelles que vous avez
										</Dialog.Title>
									</div>
									<div className={'flex h-full w-full gap-16'}>
										<div
											className={'max-h-[600px] w-2/5 overflow-y-scroll pr-4'}
										>
											<div className="grid grid-cols-1 gap-4">
												<div className={'flex flex-col gap-4'}>
													<form
														onSubmit={handleSubmit(onSubmit)}
														method="POST"
														className="flex flex-col gap-4"
													>
														<div>
															<label
																htmlFor="name"
																className="block text-sm text-slate-700"
															>
																Nom de la prestation
															</label>
															<div className="mt-2">
																<input
																	id="name"
																	name="name"
																	type={'text'}
																	{...register('name', {
																		required: true,
																	})}
																	required
																	value={userServiceOffersName ?? ''}
																	onChange={handleUpdateServiceOffersName}
																	className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm "
																/>
																{errors.name && (
																	<p className={'mt-2 text-xs text-red-500/80'}>
																		{errors.name.message}
																	</p>
																)}
															</div>
														</div>
														<div>
															<label
																htmlFor="description"
																className="block text-sm text-slate-700"
															>
																{"Description de l'expérience"}
															</label>
															<div className="mt-2">
																<textarea
																	id="description"
																	name="description"
																	{...register('description', {
																		required: true,
																	})}
																	required
																	value={userServiceOffersDescription ?? ''}
																	onChange={
																		handleUpdateServiceOffersDescription
																	}
																	className="block min-h-[150px] w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm "
																/>
																{errors.description && (
																	<p className={'mt-2 text-xs text-red-500/80'}>
																		{errors.description.message}
																	</p>
																)}
															</div>
														</div>
														<div>
															<label
																htmlFor="price"
																className="block text-sm text-slate-700"
															>
																Prix de la prestation
															</label>
															<div className="mt-2">
																<input
																	id="price"
																	name="price"
																	type={'text'}
																	{...register('price', {
																		required: true,
																	})}
																	required
																	value={userServiceOffersPrice ?? ''}
																	onChange={handleUpdateServiceOffersPrice}
																	className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm "
																/>
																{errors.price && (
																	<p className={'mt-2 text-xs text-red-500/80'}>
																		{errors.price.message}
																	</p>
																)}
															</div>
														</div>
													</form>
													{/* loop on table of options */}
													<div>
														{userServiceOffersOptions.map((option, index) => (
															<div
																key={index}
																className={
																	'flex w-full flex-col gap-4 py-4 pl-8'
																}
															>
																<h3
																	className={
																		'text-sm font-semibold text-slate-900'
																	}
																>
																	Option {index + 1}
																</h3>
																<div>
																	<label
																		htmlFor="name"
																		className="block text-sm text-slate-700"
																	>
																		Nom de la prestation
																	</label>
																	<div className="mt-2">
																		<input
																			id={`name${index}`}
																			name={`name${index}`}
																			type={'text'}
																			required
																			onChange={event => {
																				// 	change the name value of the correct option
																				setUserServiceOffersOptions(
																					userServiceOffersOptions.map(
																						(option, optionIndex) => {
																							if (optionIndex === index) {
																								return {
																									...option,
																									name: event.target.value,
																								}
																							}
																							return option
																						}
																					)
																				)
																			}}
																			value={
																				userServiceOffersOptions[index].name
																			}
																			className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm "
																		/>
																	</div>
																</div>
																<div>
																	<label
																		htmlFor="description"
																		className="block text-sm text-slate-700"
																	>
																		{"Description de l'expérience"}
																	</label>
																	<div className="mt-2">
																		<textarea
																			id="description"
																			name="description"
																			required
																			onChange={event => {
																				// 	change the name value of the correct option
																				setUserServiceOffersOptions(
																					userServiceOffersOptions.map(
																						(option, optionIndex) => {
																							if (optionIndex === index) {
																								return {
																									...option,
																									description:
																										event.target.value,
																								}
																							}
																							return option
																						}
																					)
																				)
																			}}
																			value={
																				userServiceOffersOptions[index]
																					.description
																			}
																			className="block min-h-[150px] w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm "
																		/>
																	</div>
																</div>
																<div>
																	<label
																		htmlFor="price"
																		className="block text-sm text-slate-700"
																	>
																		Prix de la prestation
																	</label>
																	<div className="mt-2">
																		<input
																			id="price"
																			name="price"
																			type={'text'}
																			required
																			onChange={event => {
																				// 	change the name value of the correct option
																				setUserServiceOffersOptions(
																					userServiceOffersOptions.map(
																						(option, optionIndex) => {
																							if (optionIndex === index) {
																								return {
																									...option,
																									price: event.target.value,
																								}
																							}
																							return option
																						}
																					)
																				)
																			}}
																			value={
																				userServiceOffersOptions[index].price
																			}
																			className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm "
																		/>
																	</div>
																</div>
															</div>
														))}
													</div>
													<div
														className={'flex w-full items-center justify-start'}
													>
														<button
															className={
																'flex w-full items-center justify-center gap-2 rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400  focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm'
															}
															onClick={handleAddServiceOffersOption}
														>
															<span className={'text-slate-700'}>
																Ajouter une option à la prestation
															</span>
															<span className="material-icons-round text-base text-slate-900">
																add
															</span>
														</button>
													</div>
													<div className={'flex items-center justify-end'}>
														<button
															type="button"
															className="btn-primary"
															onClick={handleSubmit(onSubmit)}
														>
															Ajouter une expérience
														</button>
													</div>
												</div>
											</div>
										</div>
										<div
											className={
												'flex max-h-[600px] w-3/5 flex-col gap-4 overflow-y-scroll pr-4'
											}
										>
											{/*	display the serviceOffers already added */}
											<h3 className={'text-sm text-slate-900'}>
												Les services déjà ajoutés
											</h3>
											<div className={'flex w-full flex-col gap-4 '}>
												<Tab.Group>
													<Tab.List
														className={'flex w-full justify-center py-4'}
													>
														{userServiceOffers.map((service_offer, index) => {
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
														{userServiceOffers.map((service_offer, index) => {
															return (
																<Tab.Panel key={index}>
																	<div
																		className={
																			'flex flex-col gap-4 bg-white py-4'
																		}
																	>
																		<div className={'flex flex-col'}>
																			<h2
																				className={
																					'text-start text-lg font-bold text-indigo-900'
																				}
																			>
																				{service_offer.name}
																			</h2>
																		</div>
																		<DescriptionPriceOffer
																			serviceOffer={service_offer}
																		/>
																	</div>
																	<div
																		className={
																			'flex w-full flex-col gap-2 py-2'
																		}
																	>
																		<OptionsOffers
																			serviceOffer={service_offer}
																		/>
																	</div>
																</Tab.Panel>
															)
														})}
													</Tab.Panels>
												</Tab.Group>
											</div>
										</div>
									</div>
								</div>
								<div className="mt-4 flex justify-end">
									<button
										type="button"
										className="btn-primary"
										onClick={handleSubmitServiceOffers}
									>
										Sauvegarder
									</button>
								</div>
							</Dialog.Panel>
						</Transition.Child>
					</div>
				</div>
			</Dialog>
		</Transition.Root>
	)
}
