import React, { Fragment, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'

import { Dialog, Transition } from '@headlessui/react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSession } from 'next-auth/react'
import * as zod from 'zod'

import { patchMeMakeup } from '@/services/PatchMeMakeup'

const schema = zod.object({
	instagram: zod
		.string()
		.url({ message: 'Veuillez entrer une URL valide (https://...).' })
		.max(200, "L'URL ne doit pas dépasser 200 caractères.")
		.optional()
		.or(zod.literal('')),
	facebook: zod
		.string()
		.url({ message: 'Veuillez entrer une URL valide (https://...).' })
		.max(200, "L'URL ne doit pas dépasser 200 caractères.")
		.optional()
		.or(zod.literal('')),
	linkedin: zod
		.string()
		.url({ message: 'Veuillez entrer une URL valide (https://...).' })
		.max(200, "L'URL ne doit pas dépasser 200 caractères.")
		.optional()
		.or(zod.literal('')),
	youtube: zod
		.string()
		.url({ message: 'Veuillez entrer une URL valide (https://...).' })
		.max(200, "L'URL ne doit pas dépasser 200 caractères.")
		.optional()
		.or(zod.literal('')),
	website: zod
		.string()
		.url({ message: 'Veuillez entrer une URL valide (https://...).' })
		.max(200, "L'URL ne doit pas dépasser 200 caractères.")
		.optional()
		.or(zod.literal('')),
	phone: zod
		.string()
		.min(10, 'Le numéro de téléphone est requis.')
		.max(20, 'Le numéro de téléphone ne doit pas dépasser 20 caractères.')
		.optional()
		.or(zod.literal('')),
	email: zod
		.string()
		.email({ message: 'Veuillez entrer un email valide.' })
		.max(200, "L'email ne doit pas dépasser 200 caractères.")
		.optional()
		.or(zod.literal('')),
})

export default function ModalUpdateSocialMediaProfil(props) {
	const user = props.user

	const {
		formState: { errors },
		handleSubmit,
		register,
		reset,
	} = useForm({
		resolver: zodResolver(schema),
	})

	const [open, setOpen] = useState(props.isModalOpen)

	const [userYoutube, setUserYoutube] = useState(user.network.youtube ?? '')
	const [userFacebook, setUserFacebook] = useState(user.network.facebook ?? '')
	const [userInstagram, setUserInstagram] = useState(
		user.network.instagram ?? ''
	)
	const [userWebsite, setUserWebsite] = useState(user.network.website ?? '')
	const [userLinkedin, setUserLinkedin] = useState(user.network.linkedin ?? '')
	const [userEmail, setUserEmail] = useState(user.network.email ?? '')
	const [userPhone, setUserPhone] = useState(user.network.phone ?? '')

	const { data: session } = useSession()

	const onSubmit = data => {
		data = {
			network: {
				...data,
			},
		}
		patchMeMakeup(session, data)

		let userTemp = user
		userTemp.network.youtube = userYoutube
		userTemp.network.facebook = userFacebook
		userTemp.network.instagram = userInstagram
		userTemp.network.website = userWebsite
		userTemp.network.linkedin = userLinkedin
		userTemp.network.email = userEmail
		userTemp.network.phone = userPhone
		// to change to object reference
		const newUser = JSON.parse(JSON.stringify(userTemp))
		props.handleUpdateUser(newUser)

		reset()
		props.handleIsModalOpen()
	}

	useEffect(() => {
		setOpen(props.isModalOpen)
	}, [props.isModalOpen])

	const cancelButtonRef = useRef(null)
	const inputRef = useRef(null)

	const handleClick = event => {
		// 👇️ open file input box on click of another element
		// 👇️ trigger click event on input element to open file dialog
		inputRef.current.click()
	}

	const handleUpdateYoutube = event => {
		setUserYoutube(event.target.value)
	}
	const handleUpdateFacebook = event => {
		setUserFacebook(event.target.value)
	}
	const handleUpdateInstagram = event => {
		setUserInstagram(event.target.value)
	}
	const handleUpdateWebsite = event => {
		setUserWebsite(event.target.value)
	}
	const handleUpdateLinkedin = event => {
		setUserLinkedin(event.target.value)
	}
	const handleUpdateEmail = event => {
		setUserEmail(event.target.value)
	}
	const handleUpdatePhone = event => {
		setUserPhone(event.target.value)
	}

	useEffect(() => {
		if (!open) {
			setUserYoutube(user.network.youtube ?? '')
			setUserFacebook(user.network.facebook ?? '')
			setUserInstagram(user.network.instagram ?? '')
			setUserWebsite(user.network.website ?? '')
			setUserLinkedin(user.network.linkedin ?? '')
			setUserEmail(user.network.email ?? '')
			setUserPhone(user.network.phone ?? '')
			reset()
		}
	}, [
		open,
		reset,
		user.network.email,
		user.network.facebook,
		user.network.instagram,
		user.network.linkedin,
		user.network.phone,
		user.network.website,
		user.network.youtube,
	])

	return (
		<Transition.Root as={Fragment} show={open}>
			<Dialog
				as="div"
				className="relative z-30"
				initialFocus={cancelButtonRef}
				onClose={props.handleIsModalOpen}
			>
				<Transition.Child
					as={Fragment}
					enter="ease-out duration-300"
					enterFrom="opacity-0"
					enterTo="opacity-100"
					leave="ease-in duration-200"
					leaveFrom="opacity-100"
					leaveTo="opacity-0"
				>
					<div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
				</Transition.Child>

				<div className="fixed inset-0 z-30 overflow-y-auto">
					<div className="flex min-h-full items-center justify-center p-4 text-center">
						<Transition.Child
							as={Fragment}
							enter="ease-out duration-300"
							enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
							enterTo="opacity-100 translate-y-0 sm:scale-100"
							leave="ease-in duration-200"
							leaveFrom="opacity-100 translate-y-0 sm:scale-100"
							leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
						>
							<Dialog.Panel className="relative w-full transform rounded-lg bg-white p-8 text-left shadow-2xl transition-all sm:max-w-2xl">
								<button
									className={
										'absolute right-0 top-0 m-6 flex items-center justify-center'
									}
									onClick={props.handleIsModalOpen}
									ref={cancelButtonRef}
									type="button"
								>
									<span className="material-icons-round">close</span>
								</button>
								<div className="flex flex-col items-start gap-8">
									<div className="text-left">
										<Dialog.Title
											as="h3"
											className="text-lg font-semibold text-gray-900"
										>
											Réseaux sociaux & contacts
										</Dialog.Title>
									</div>
									<div className={'w-full md:w-3/5'}>
										<div className="grid grid-cols-1 gap-4">
											<div className={'flex flex-col gap-4'}>
												<form
													className="flex flex-col gap-4"
													method="POST"
													onSubmit={handleSubmit(onSubmit)}
												>
													<div>
														<label
															className="block text-sm text-gray-700"
															htmlFor="email"
														>
															Email
														</label>
														<div className="mt-2">
															<input
																data-cy="email-input"
																id="email"
																name="email"
																type="text"
																{...register('email', {
																	required: false,
																})}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
																onChange={handleUpdateEmail}
																value={userEmail ?? ''}
															/>
															{errors.email && (
																<p
																	className={'mt-2 text-xs text-red-500/80'}
																	data-cy={'error-email'}
																>
																	{errors.email.message}
																</p>
															)}
														</div>
													</div>
													<div>
														<label
															className="block text-sm text-gray-700"
															htmlFor="phone"
														>
															Numéro de téléphone
														</label>
														<div className="mt-2">
															<input
																data-cy="phone-input"
																id="phone"
																name="phone"
																type="text"
																{...register('phone', {
																	required: false,
																})}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
																onChange={handleUpdatePhone}
																value={userPhone ?? ''}
															/>
															{errors.phone && (
																<p
																	className={'mt-2 text-xs text-red-500/80'}
																	data-cy={'error-phone'}
																>
																	{errors.phone.message}
																</p>
															)}
														</div>
													</div>
													<div>
														<label
															className="block text-sm text-gray-700"
															htmlFor="youtube"
														>
															Lien Youtube
														</label>
														<div className="mt-2">
															<input
																data-cy="youtube-input"
																id="youtube"
																name="youtube"
																type="text"
																{...register('youtube', {
																	required: false,
																})}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
																onChange={handleUpdateYoutube}
																value={userYoutube ?? ''}
															/>
															{errors.youtube && (
																<p
																	className={'mt-2 text-xs text-red-500/80'}
																	data-cy={'error-youtube'}
																>
																	{errors.youtube.message}
																</p>
															)}
														</div>
													</div>
													<div>
														<label
															className="block text-sm text-gray-700"
															htmlFor="facebook"
														>
															Lien Facebook
														</label>
														<div className="mt-2">
															<input
																data-cy="facebook-input"
																id="facebook"
																name="facebook"
																type="text"
																{...register('facebook', {
																	required: false,
																})}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
																onChange={handleUpdateFacebook}
																value={userFacebook ?? ''}
															/>
															{errors.facebook && (
																<p
																	className={'mt-2 text-xs text-red-500/80'}
																	data-cy={'error-facebook'}
																>
																	{errors.facebook.message}
																</p>
															)}
														</div>
													</div>
													<div>
														<label
															className="block text-sm text-gray-700"
															htmlFor="instagram"
														>
															Lien Instagram
														</label>
														<div className="mt-2">
															<input
																data-cy="instagram-input"
																id="instagram"
																name="instagram"
																type="text"
																{...register('instagram', {
																	required: false,
																})}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
																onChange={handleUpdateInstagram}
																value={userInstagram ?? ''}
															/>
															{errors.instagram && (
																<p
																	className={'mt-2 text-xs text-red-500/80'}
																	data-cy={'error-instagram'}
																>
																	{errors.instagram.message}
																</p>
															)}
														</div>
													</div>
													<div>
														<label
															className="block text-sm text-gray-700"
															htmlFor="website"
														>
															Lien de votre site internet
														</label>
														<div className="mt-2">
															<input
																data-cy="website-input"
																id="website"
																name="website"
																type="text"
																{...register('website', {
																	required: false,
																})}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
																onChange={handleUpdateWebsite}
																value={userWebsite ?? ''}
															/>
															{errors.website && (
																<p
																	className={'mt-2 text-xs text-red-500/80'}
																	data-cy={'error-website'}
																>
																	{errors.website.message}
																</p>
															)}
														</div>
													</div>
													<div>
														<label
															className="block text-sm text-gray-700"
															htmlFor="linkedin"
														>
															Lien linkedin
														</label>
														<div className="mt-2">
															<input
																data-cy="linkedin-input"
																id="linkedin"
																name="linkedin"
																type="text"
																{...register('linkedin', {
																	required: false,
																})}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
																onChange={handleUpdateLinkedin}
																value={userLinkedin ?? ''}
															/>
															{errors.linkedin && (
																<p
																	className={'mt-2 text-xs text-red-500/80'}
																	data-cy={'error-linkedin'}
																>
																	{errors.linkedin.message}
																</p>
															)}
														</div>
													</div>
												</form>
											</div>
										</div>
									</div>
								</div>
								<div className="mt-4 flex justify-end">
									<button
										className="btn-primary"
										data-cy="save-button-social-medias"
										onClick={handleSubmit(onSubmit)}
										type="button"
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
