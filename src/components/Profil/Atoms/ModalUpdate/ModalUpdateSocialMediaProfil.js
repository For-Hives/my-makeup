import React, { Fragment, useEffect, useRef, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import { useSession } from 'next-auth/react'
import * as yup from 'yup'
import { useQueryClient } from '@tanstack/react-query'
import { putMakeupArtisteViaId } from '@/components/Profil/Atoms/ModalUpdate/PutMakeupArtisteViaId'

const schema = yup.object().shape({
	youtube: yup.string(),
	facebook: yup.string(),
	instagram: yup.string(),
	website: yup.string(),
	linkedin: yup.string(),
	email: yup.string(),
	phone: yup.string(),
})

/**
 * ModalUpdateSocialMediaProfil
 * @param props
 * @constructor
 */
export default function ModalUpdateSocialMediaProfil(props) {
	const queryClient = useQueryClient()

	const user = props.user

	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm({
		resolver: yupResolver(schema),
	})

	const [open, setOpen] = useState(props.modalUpdateSocialMediaProfil)

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
			...user,
			...data,
		}
		putMakeupArtisteViaId(queryClient, user, session, data)

		props.handleModalUpdateSocialMediaProfil()
	}

	useEffect(() => {
		setOpen(props.modalUpdateSocialMediaProfil)
	}, [props.modalUpdateSocialMediaProfil])

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

	return (
		<Transition.Root show={open} as={Fragment}>
			<Dialog
				as="div"
				className="relative z-10"
				initialFocus={cancelButtonRef}
				onClose={props.handleModalUpdateSocialMediaProfil}
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
					<div className="fixed inset-0 bg-slate-500 bg-opacity-75 transition-opacity" />
				</Transition.Child>

				<div className="fixed inset-0 z-10 overflow-y-auto">
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
									type="button"
									onClick={props.handleModalUpdateSocialMediaProfil}
									ref={cancelButtonRef}
									className={
										'absolute right-0 top-0 m-6 flex items-center justify-center'
									}
								>
									<span className="material-symbols-rounded">close</span>
								</button>
								<div className="flex flex-col items-start gap-8">
									<div className="text-left">
										<Dialog.Title
											as="h3"
											className="text-lg font-semibold text-slate-900"
										>
											Réseaux sociaux & contacts
										</Dialog.Title>
									</div>
									<div className={'w-3/5'}>
										<div className="grid grid-cols-1 gap-4">
											<div className={'flex flex-col gap-4'}>
												<form
													onSubmit={handleSubmit(onSubmit)}
													method="POST"
													className="flex flex-col gap-4"
												>
													<div>
														<label
															htmlFor="youtube"
															className="block text-sm text-slate-700"
														>
															Lien Youtube
														</label>
														<div className="mt-2">
															<input
																id="youtube"
																name="youtube"
																type="text"
																{...register('youtube', {
																	required: true,
																})}
																required
																value={userYoutube ?? ''}
																onChange={handleUpdateYoutube}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm "
															/>
															{errors.youtube && (
																<p className={'mt-2 text-xs text-red-500/80'}>
																	{errors.youtube.message}
																</p>
															)}
														</div>
													</div>
													<div>
														<label
															htmlFor="facebook"
															className="block text-sm text-slate-700"
														>
															Lien facebook
														</label>
														<div className="mt-2">
															<input
																id="facebook"
																name="facebook"
																type="text"
																{...register('facebook', {
																	required: true,
																})}
																required
																value={userFacebook ?? ''}
																onChange={handleUpdateFacebook}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm "
															/>
															{errors.facebook && (
																<p className={'mt-2 text-xs text-red-500/80'}>
																	{errors.facebook.message}
																</p>
															)}
														</div>
													</div>
													<div>
														<label
															htmlFor="instagram"
															className="block text-sm text-slate-700"
														>
															Lien Instagram
														</label>
														<div className="mt-2">
															<input
																id="instagram"
																name="instagram"
																type="text"
																{...register('instagram', {
																	required: true,
																})}
																required
																value={userInstagram ?? ''}
																onChange={handleUpdateInstagram}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm "
															/>
															{errors.instagram && (
																<p className={'mt-2 text-xs text-red-500/80'}>
																	{errors.instagram.message}
																</p>
															)}
														</div>
													</div>
													<div>
														<label
															htmlFor="website"
															className="block text-sm text-slate-700"
														>
															Lien website
														</label>
														<div className="mt-2">
															<input
																id="website"
																name="website"
																type="text"
																{...register('website', {
																	required: true,
																})}
																required
																value={userWebsite ?? ''}
																onChange={handleUpdateWebsite}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm "
															/>
															{errors.website && (
																<p className={'mt-2 text-xs text-red-500/80'}>
																	{errors.website.message}
																</p>
															)}
														</div>
													</div>
													<div>
														<label
															htmlFor="linkedin"
															className="block text-sm text-slate-700"
														>
															Lien linkedin
														</label>
														<div className="mt-2">
															<input
																id="linkedin"
																name="linkedin"
																type="text"
																{...register('linkedin', {
																	required: true,
																})}
																required
																value={userLinkedin ?? ''}
																onChange={handleUpdateLinkedin}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm "
															/>
															{errors.linkedin && (
																<p className={'mt-2 text-xs text-red-500/80'}>
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
										type="button"
										className="btn-primary"
										onClick={handleSubmit(onSubmit)}
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
