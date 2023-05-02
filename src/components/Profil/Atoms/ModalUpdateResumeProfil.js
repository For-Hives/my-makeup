import React, { Fragment, useEffect, useRef, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import Image from 'next/image'
import { PhotoIcon } from '@heroicons/react/20/solid'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import { signIn, useSession } from 'next-auth/react'
import * as yup from 'yup'

const schema = yup.object().shape({
	first_name: yup.string().required('Nom est requis'),
	last_name: yup.string().required('Prénom est requis'),
	speciality: yup.string().required('Spécialité est requise'),
	availability: yup.boolean().required('Disponibilité est requise'),
})

export default function ModalUpdateResumeProfil(props) {
	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm({
		resolver: yupResolver(schema),
	})

	const [open, setOpen] = useState(props.modalUpdateResumeProfil)
	const [imageUrl, setImageUrl] = useState('')

	const { data: session } = useSession()

	const onSubmit = data => {
		console.log(data)
	}

	useEffect(() => {
		setOpen(props.modalUpdateResumeProfil)
	}, [props.modalUpdateResumeProfil])

	const cancelButtonRef = useRef(null)

	const inputRef = useRef(null)

	const handleClick = event => {
		// 👇️ open file input box on click of another element
		// 👇️ trigger click event on input element to open file dialog
		inputRef.current.click()
	}

	const handleFileChange = event => {
		const fileObj = event.target.files && event.target.files[0]
		if (!fileObj) {
			return
		}

		const imageUrl = URL.createObjectURL(fileObj)
		setImageUrl(imageUrl)

		// reset file input
		event.target.value = null
	}

	useEffect(() => {
		return () => {
			if (imageUrl) {
				URL.revokeObjectURL(imageUrl)
			}
		}
	}, [imageUrl])

	return (
		<Transition.Root show={open} as={Fragment}>
			<Dialog
				as="div"
				className="relative z-10"
				initialFocus={cancelButtonRef}
				onClose={props.handleModalUpdateResumeProfil}
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
							<Dialog.Panel className="relative w-full transform rounded-lg bg-white p-8 text-left shadow-2xl transition-all sm:max-w-3xl">
								<button
									type="button"
									onClick={props.handleModalUpdateResumeProfil}
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
											Modifier votre profil
										</Dialog.Title>
									</div>
									<div>
										<div className="grid grid-cols-1 gap-4">
											<div className={'flex flex-col gap-4'}>
												<label
													htmlFor="cover-photo"
													className="text-base font-normal text-slate-700"
												>
													Modifier votre photo de profil
												</label>
												<button
													className="mt-2 sm:col-span-2 sm:mt-0"
													onClick={handleClick}
												>
													<div className="relative flex justify-center rounded-lg border border-dashed border-slate-900/25 px-6 py-10">
														{!!imageUrl && imageUrl !== '' ? (
															<div
																className={
																	'relative flex h-[200px] w-[200px] items-center justify-center overflow-hidden rounded-full'
																}
															>
																<Image
																	src={imageUrl}
																	alt={'photo de profil'}
																	fill={true}
																	className="rounded-full object-cover object-center"
																/>
															</div>
														) : null}
														<div
															className={
																'text-center' +
																(!!imageUrl && imageUrl !== ''
																	? ' hidden'
																	: ' block')
															}
														>
															<PhotoIcon
																className="mx-auto h-12 w-12 text-slate-300"
																aria-hidden="true"
															/>
															<div className="mt-4 flex text-sm leading-6 text-slate-600">
																<label className="relative rounded-md bg-white font-semibold text-indigo-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-indigo-600 focus-within:ring-offset-2 hover:text-indigo-500">
																	<span>Télécharger une nouvelle photo</span>
																</label>
																<input
																	id="file-upload"
																	name="file-upload"
																	type="file"
																	className="sr-only hidden"
																	ref={inputRef}
																	onChange={handleFileChange}
																/>
															</div>
															<p className="text-xs leading-5 text-slate-600">
																{"PNG, JPG, WEBP jusqu'à 5MB"}
															</p>
														</div>
													</div>
												</button>
											</div>
											<div className={'flex flex-col gap-4'}>
												<form
													onSubmit={handleSubmit(onSubmit)}
													method="POST"
													className="flex flex-col gap-4"
												>
													<div className={'flex gap-2'}>
														<div>
															<label
																htmlFor="last_name"
																className="block text-sm text-slate-700"
															>
																Nom
															</label>
															<div className="mt-2">
																<input
																	id="last_name"
																	name="last_name"
																	type="text"
																	{...register('last_name', {
																		required: true,
																	})}
																	required
																	className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm "
																/>
																{errors.name && (
																	<p className={'mt-2 text-xs text-red-500/80'}>
																		{errors.last_name.message}
																	</p>
																)}
															</div>
														</div>
														<div>
															<label
																htmlFor="first_name"
																className="block text-sm text-slate-700"
															>
																Prénom
															</label>
															<div className="mt-2">
																<input
																	id="first_name"
																	name="first_name"
																	type="text"
																	{...register('first_name', {
																		required: true,
																	})}
																	required
																	className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm "
																/>
																{errors.name && (
																	<p className={'mt-2 text-xs text-red-500/80'}>
																		{errors.first_name.message}
																	</p>
																)}
															</div>
														</div>
													</div>
													<div>
														<label
															htmlFor="speciality"
															className="block text-sm text-slate-700"
														>
															Specialité
														</label>
														<div className="mt-2">
															<input
																id="speciality"
																name="speciality"
																type="text"
																{...register('speciality', {
																	required: true,
																})}
																required
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm "
															/>
															{errors.name && (
																<p className={'mt-2 text-xs text-red-500/80'}>
																	{errors.speciality.message}
																</p>
															)}
														</div>
													</div>
													<div>
														<label
															htmlFor="availability"
															className="block text-sm text-slate-700"
														>
															Disponibilité
														</label>
														<div className="mt-2">
															{/*    <input*/}
															{/*        id="availability"*/}
															{/*        name="availability"*/}
															{/*        type="checkbox"*/}
															{/*        {...register('availability', {*/}
															{/*            required: true,*/}
															{/*        })}*/}
															{/*        required*/}
															{/*        className="block rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600 sm:text-sm "*/}
															{/*    />*/}
															{/*    {errors.name && (*/}
															{/*        <p className={'mt-2 text-xs text-red-500/80'}>*/}
															{/*            {errors.availability.message}*/}
															{/*        </p>*/}
															{/*    )}*/}
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
										onClick={props.handleModalUpdateResumeProfil}
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
