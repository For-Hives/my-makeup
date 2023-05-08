import React, { Fragment, useEffect, useRef, useState } from 'react'
import { Dialog, Switch, Transition } from '@headlessui/react'
import Image from 'next/image'
import { PhotoIcon } from '@heroicons/react/20/solid'
import { useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import { useSession } from 'next-auth/react'
import * as yup from 'yup'
import { useQueryClient } from '@tanstack/react-query'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Pagination } from 'swiper'
import { patchMeMakeup } from '@/services/PatchMeMakeup'

const schema = yup.object().shape({})
export default function ModalUpdatePortfolioProfil(props) {
	const queryClient = useQueryClient()

	const user = props.user

	const { handleSubmit, reset } = useForm({
		resolver: yupResolver(schema),
	})

	const [fileObj, setFileObj] = useState('')
	const [open, setOpen] = useState(props.modalUpdatePortfolioProfil)
	const [imageUrl, setImageUrl] = useState('')
	const [mySwiperModal, setMySwiperModal] = React.useState(null)
	const [userImageGallery, setUserImageGallery] = useState(
		user.image_gallery ?? []
	)

	const { data: session } = useSession()

	const onSubmit = data => {
		// 	upload file if fileObj is not empty
		if (fileObj !== '' && fileObj !== undefined && fileObj !== null) {
			const form = new FormData()
			form.append('files', fileObj)

			const res_post = fetch(`${process.env.NEXT_PUBLIC_API_URL}api/upload`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${session.jwt}`,
				},
				body: form,
			})
				.then(response => {
					return response.json()
				})
				.then(data_blob => {
					data_blob = data_blob[0]
					// props.handleModalUpdatePortfolioProfil()
					// 	add image to gallery
					setUserImageGallery([...userImageGallery, data_blob])
					setImageUrl('')
					reset()
				})
				.catch(err => console.error(err))
		} else {
			// putMakeupArtisteViaId(queryClient, user, session, data)
			reset()
			// props.handleModalUpdatePortfolioProfil()
			setImageUrl('')
		}
	}

	const handleSubmitGallery = () => {
		const data = {
			image_gallery: userImageGallery,
		}
		patchMeMakeup(queryClient, user, session, data)
		setImageUrl('')
		props.handleModalUpdatePortfolioProfil()
	}

	useEffect(() => {
		setOpen(props.modalUpdatePortfolioProfil)
	}, [props.modalUpdatePortfolioProfil])

	const cancelButtonRef = useRef(null)
	const inputRef = useRef(null)

	const handleClick = event => {
		// 👇️ open file input box on click of another element
		// 👇️ trigger click event on input element to open file dialog
		inputRef.current.click()
	}

	const handleFileChange = event => {
		const fileObject = event.target.files && event.target.files[0]
		if (!fileObject) {
			return
		}

		const imageUrl = URL.createObjectURL(fileObject)
		setImageUrl(imageUrl)
		setFileObj(fileObject)

		// reset file input
		event.target.value = null
	}

	const handleDeletePortfolio = index => {
		const newGallery = userImageGallery.filter(item => item.id !== index)
		setUserImageGallery(newGallery)
	}

	useEffect(() => {
		return () => {
			if (imageUrl) {
				URL.revokeObjectURL(imageUrl)
			}
		}
	}, [imageUrl])

	// reset the form when the modal is closed
	useEffect(() => {
		if (!open) {
			setFileObj('')
			setImageUrl('')
			setUserImageGallery(user.image_gallery ?? [])
			reset()
		}
	}, [open, reset, user.image_gallery])

	return (
		<Transition.Root show={open} as={Fragment}>
			<Dialog
				as="div"
				className="relative z-30"
				initialFocus={cancelButtonRef}
				onClose={props.handleModalUpdatePortfolioProfil}
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
							<Dialog.Panel className="relative w-full transform rounded-lg bg-white p-8 text-left shadow-2xl transition-all sm:max-w-7xl">
								<button
									type="button"
									onClick={props.handleModalUpdatePortfolioProfil}
									ref={cancelButtonRef}
									className={
										'absolute right-0 top-0 m-6 flex items-center justify-center'
									}
								>
									<span className="material-icons-round">close</span>
								</button>
								<div>
									<div className="flex flex-col items-start gap-8">
										<div className="text-left">
											<Dialog.Title
												as="h3"
												className="text-lg font-semibold text-slate-900"
											>
												Modifier votre portfolio
											</Dialog.Title>
										</div>
										<div className={'flex w-full gap-16'}>
											<div className="grid w-2/6 grid-cols-1 gap-4 ">
												<div className={'flex flex-col gap-4'}>
													<label
														htmlFor="cover-photo"
														className="text-base font-normal text-slate-700"
													>
														Ajouter une photo à votre portfolio
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
													<div className=" flex justify-end">
														<button
															type="button"
															className="btn-primary"
															onClick={handleSubmit(onSubmit)}
														>
															Ajouter
														</button>
													</div>
												</div>
											</div>
											<div className={'flex w-4/6'}>
												<div className={'flex w-full flex-col gap-4 rounded'}>
													<h2 className={'text-xl font-bold text-slate-700'}>
														Portfolio
													</h2>
													<>
														<Swiper
															slidesPerView={'auto'}
															spaceBetween={32}
															pagination={{
																clickable: true,
															}}
															modules={[Pagination]}
															className="h-[500px] w-full"
															onSlideChange={swiper => {
																// console.log(swiper.activeIndex)
															}}
															onInit={eve => {
																console.log(eve)
																setMySwiperModal(eve)
															}}
														>
															{
																// 	map on user?.image_gallery and return a SwiperSlide with the image
															}
															{userImageGallery.map((image, index) => {
																return (
																	<SwiperSlide
																		key={index}
																		style={{
																			aspectRatio: `${image.width}/${image.height}`,
																			height: '100%',
																		}}
																		className={'relative !h-[500px] !w-auto'}
																	>
																		<button
																			className={
																				'absolute right-0 top-0 z-40 m-4 flex h-8 w-8 items-center justify-center rounded-full bg-red-50 shadow'
																			}
																			onClick={() =>
																				handleDeletePortfolio(image.id)
																			}
																		>
																			<span className="material-icons-round text-xl text-red-500">
																				delete
																			</span>
																		</button>
																		<Image
																			src={image.url}
																			alt={
																				image.alternativeText ??
																				image.name ??
																				'portefolio image'
																			}
																			fill={true}
																			className={'rounded object-cover'}
																		/>
																	</SwiperSlide>
																)
															})}
														</Swiper>
													</>
													{/* btn to go on next slide */}
													<div
														className={
															'flex w-full items-center justify-between'
														}
													>
														<div>
															<button
																className={
																	'flex items-center justify-center gap-2'
																}
																onClick={() => {
																	if (mySwiperModal.activeIndex === 0) {
																		console.log(mySwiperModal)
																		// 	go to the last slide
																		mySwiperModal.slideTo(
																			mySwiperModal.slides.length - 1
																		)
																	} else {
																		mySwiperModal.slidePrev()
																	}
																}}
															>
																<Image
																	alt={'next'}
																	src={'/assets/down-arrow.svg'}
																	className={'rotate-90'}
																	width={20}
																	height={20}
																></Image>
																<span
																	className={'font-semibold text-indigo-950'}
																>
																	Précédent
																</span>
															</button>
														</div>
														<div>
															<button
																className={
																	'flex items-center justify-center gap-2'
																}
																onClick={() => {
																	if (
																		mySwiperModal.activeIndex ===
																		mySwiperModal.slides.length - 1
																	) {
																		// 	go to the first slide
																		mySwiperModal.slideTo(0)
																	} else {
																		mySwiperModal.slideNext()
																	}
																}}
															>
																<span
																	className={'font-semibold text-indigo-950'}
																>
																	Suivant
																</span>
																<Image
																	alt={'next'}
																	src={'/assets/down-arrow.svg'}
																	className={'-rotate-90'}
																	width={20}
																	height={20}
																></Image>
															</button>
														</div>
													</div>
												</div>
											</div>
										</div>
									</div>
								</div>
								<div className="mt-4 flex justify-end">
									<button
										type="button"
										className="btn-primary"
										onClick={handleSubmitGallery}
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
