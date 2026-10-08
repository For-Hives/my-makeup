import React, { Fragment, useEffect, useRef, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import Image from 'next/image'
import { PhotoIcon } from '@heroicons/react/20/solid'
import { useSession } from 'next-auth/react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Pagination } from 'swiper/modules'
import { patchMeMakeup } from '@/services/PatchMeMakeup'
import { uploadPhoto } from '@/services/UploadPhoto'
import Info from '@/components/Global/Info'
import { ACCEPT, MAX_PHOTOS_GALERIE, MESSAGES_PHOTO } from '@/lib/photo'
import {
	BoutonFermer,
	BoutonSauvegarder,
	ErreurSauvegarde,
	FondModale,
} from '@/components/Profil/Atoms/ModalUpdate/ModalElements'
import { choisirPhoto } from '@/components/Profil/Atoms/ModalUpdate/choisirPhoto'

// A picture added in the modal stays in the browser until « Sauvegarder »:
// { cle, fichier, url (blob preview), width, height, enAttente: true }.
// Closing the modal without saving sends nothing, so no file is left on the
// server (UI-03). The stored pictures are Strapi files ({ id, url, … }).
let compteurLocal = 0

const revoquer = photos => {
	for (const photo of photos)
		if (photo.enAttente) URL.revokeObjectURL(photo.url)
}

export default function ModalUpdatePortfolioProfil(props) {
	const user = props.user

	const [open, setOpen] = useState(props.isModalOpen)
	// picked and compressed, shown in the dashed area until « Ajouter »
	const [photoChoisie, setPhotoChoisie] = useState(null)
	const [erreurPhoto, setErreurPhoto] = useState(null)
	const [preparation, setPreparation] = useState(false)
	const [envoi, setEnvoi] = useState(false)
	const [erreurEnvoi, setErreurEnvoi] = useState(null)
	const [mySwiperModal, setMySwiperModal] = React.useState(null)
	const [userImageGallery, setUserImageGallery] = useState(
		user.image_gallery ?? []
	)

	const { data: session } = useSession()

	const handleAddPhoto = () => {
		if (!photoChoisie) return
		if (userImageGallery.length >= MAX_PHOTOS_GALERIE) {
			setErreurPhoto(MESSAGES_PHOTO['limite-galerie'])
			return
		}
		setUserImageGallery([...userImageGallery, photoChoisie])
		setPhotoChoisie(null)
	}

	// uploads the pictures added in the modal, then saves the gallery; the page
	// changes, and the modal closes, only once the API stored the gallery
	const handleSubmitGallery = async () => {
		setEnvoi(true)
		setErreurEnvoi(null)

		const galerie = [...userImageGallery]
		for (let i = 0; i < galerie.length; i++) {
			if (!galerie[i].enAttente) continue
			const envoiPhoto = await uploadPhoto(session, galerie[i].fichier)
			if (!envoiPhoto.ok) {
				// the pictures already sent stay sent: a retry does not resend them
				setUserImageGallery(galerie)
				setEnvoi(false)
				setErreurEnvoi(envoiPhoto.message ?? null)
				return
			}
			URL.revokeObjectURL(galerie[i].url)
			galerie[i] = envoiPhoto.fichier
		}
		setUserImageGallery(galerie)

		const champs = { image_gallery: galerie.map(photo => photo.id) }
		const resultat = await patchMeMakeup(session, champs, 'portfolio')
		setEnvoi(false)
		if (!resultat.ok) {
			setErreurEnvoi(resultat.message ?? null)
			return
		}

		props.handleUpdateUser({ ...user, image_gallery: galerie })
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

	const handleFileChange = async event => {
		const fileObject = event.target.files && event.target.files[0]
		// reset file input, the same file can be picked again
		event.target.value = null
		if (!fileObject) {
			return
		}

		setErreurPhoto(null)
		setPreparation(true)
		const resultat = await choisirPhoto(fileObject)
		setPreparation(false)
		if (!resultat.ok) {
			setErreurPhoto(resultat.message)
			return
		}
		if (photoChoisie) URL.revokeObjectURL(photoChoisie.url)
		setPhotoChoisie({
			cle: `local-${++compteurLocal}`,
			enAttente: true,
			fichier: resultat.fichier,
			url: URL.createObjectURL(resultat.fichier),
			width: resultat.largeur,
			height: resultat.hauteur,
			name: resultat.fichier.name,
		})
	}

	const handleDeletePortfolio = photo => {
		if (photo.enAttente) URL.revokeObjectURL(photo.url)
		setUserImageGallery(
			userImageGallery.filter(item =>
				photo.enAttente ? item.cle !== photo.cle : item.id !== photo.id
			)
		)
	}

	// reset the modal when it is closed: the pictures that were not saved are
	// dropped (nothing was sent for them)
	useEffect(() => {
		if (!open) {
			setUserImageGallery(galerie => {
				revoquer(galerie)
				return user.image_gallery ?? []
			})
			setPhotoChoisie(choisie => {
				if (choisie) URL.revokeObjectURL(choisie.url)
				return null
			})
			setErreurPhoto(null)
			setErreurEnvoi(null)
		}
	}, [open, user.image_gallery])

	const nombreEnAttente = userImageGallery.filter(
		photo => photo.enAttente
	).length

	return (
		<Transition.Root show={open} as={Fragment}>
			<Dialog
				as="div"
				className="relative z-30"
				initialFocus={cancelButtonRef}
				onClose={props.handleIsModalOpen}
			>
				<FondModale />

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
							<Dialog.Panel
								data-cy="modal-panel"
								className="relative w-full transform rounded-lg bg-white p-8 text-left shadow-2xl transition-all sm:max-w-7xl"
							>
								<BoutonFermer
									onClick={props.handleIsModalOpen}
									ref={cancelButtonRef}
								/>
								<div>
									<div className="flex flex-col items-start gap-8">
										<div className="text-left">
											<Dialog.Title
												as="h3"
												className="text-lg font-semibold text-gray-900"
											>
												Modifier votre portfolio
											</Dialog.Title>
										</div>
										<div
											className={'flex w-full flex-wrap gap-16 md:flex-nowrap'}
										>
											<div className="grid w-full grid-cols-1 gap-4 md:w-2/6">
												<div className={'flex flex-col gap-4'}>
													<label
														htmlFor="photo-portfolio-upload"
														className="text-base font-normal text-gray-700"
													>
														Ajouter une photo à votre portfolio
													</label>
													<button
														type="button"
														data-cy="pick-portfolio-picture"
														aria-label="Choisir une photo à ajouter"
														aria-describedby="photo-portfolio-aide"
														className="mt-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 sm:col-span-2 sm:mt-0"
														onClick={handleClick}
														disabled={preparation || envoi}
													>
														<div className="relative flex justify-center rounded-lg border border-dashed border-gray-900/25 px-6 py-10">
															{photoChoisie ? (
																<div
																	className={
																		'relative flex h-[200px] w-[200px] items-center justify-center overflow-hidden rounded-full'
																	}
																>
																	<Image
																		data-cy="portfolio-preview"
																		src={photoChoisie.url}
																		alt={'photo à ajouter'}
																		fill={true}
																		sizes="200px"
																		className="rounded-full object-cover object-center"
																	/>
																</div>
															) : null}
															<div
																className={
																	'text-center' +
																	(photoChoisie ? ' hidden' : ' block')
																}
															>
																<PhotoIcon
																	className="mx-auto h-12 w-12 text-gray-300"
																	aria-hidden="true"
																/>
																<div className="mt-4 flex text-sm leading-6 text-gray-600">
																	<span className="relative rounded-md bg-white font-semibold text-indigo-600 hover:text-indigo-500">
																		{preparation
																			? 'Préparation de la photo…'
																			: 'Télécharger une nouvelle photo'}
																	</span>
																</div>
																<p
																	id="photo-portfolio-aide"
																	className="text-xs leading-5 text-gray-600"
																>
																	JPEG, PNG ou WebP, réduite avant l&apos;envoi
																</p>
															</div>
														</div>
													</button>
													<input
														data-cy="file-upload-portefolio"
														id="photo-portfolio-upload"
														name="photo-portfolio-upload"
														type="file"
														accept={ACCEPT}
														className="sr-only"
														tabIndex={-1}
														ref={inputRef}
														onChange={handleFileChange}
													/>
													{erreurPhoto && (
														<p
															role="alert"
															data-cy="photo-error"
															className="rounded-md bg-red-50 p-3 text-sm text-red-800"
														>
															{erreurPhoto}
														</p>
													)}
													<div
														className={'flex w-full items-center justify-end'}
													>
														<Info
															description={
																'Vous ne pouvez upload que 10 images maximum.'
															}
														/>
													</div>
													<div className="flex justify-end">
														<button
															data-cy="add-button-portefolio"
															type="button"
															className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
															onClick={handleAddPhoto}
															disabled={!photoChoisie || preparation || envoi}
														>
															Ajouter
														</button>
													</div>
												</div>
											</div>
											<div className={'flex w-full md:w-4/6'}>
												<div className={'flex w-full flex-col gap-4 rounded'}>
													<h2 className={'text-xl font-bold text-gray-700'}>
														Portfolio
													</h2>
													{nombreEnAttente > 0 && (
														<p
															data-cy="portfolio-pending"
															className="text-sm text-gray-700"
														>
															{nombreEnAttente === 1
																? '1 photo sera envoyée quand vous sauvegarderez.'
																: `${nombreEnAttente} photos seront envoyées quand vous sauvegarderez.`}
														</p>
													)}
													<>
														<Swiper
															slidesPerView={'auto'}
															spaceBetween={32}
															pagination={{
																clickable: true,
															}}
															loop={true}
															modules={[Pagination]}
															className="h-[500px] w-full"
															onInit={eve => {
																setMySwiperModal(eve)
															}}
														>
															{
																// 	map on user?.image_gallery and return a SwiperSlide with the image
															}
															{userImageGallery.map((image, index) => {
																return (
																	<SwiperSlide
																		key={image.cle ?? image.id}
																		data-cy="portfolio-slide"
																		style={{
																			aspectRatio: `${image.width}/${image.height}`,
																			height: '100%',
																		}}
																		className={'relative !h-[500px] !w-auto'}
																	>
																		<button
																			type="button"
																			data-cy="delete-button-portefolio"
																			aria-label={`Retirer la photo ${index + 1}`}
																			className={
																				'absolute left-0 top-0 z-40 m-4 flex h-11 w-11 items-center justify-center rounded-full bg-red-50 shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 md:left-auto md:right-0'
																			}
																			onClick={() =>
																				handleDeletePortfolio(image)
																			}
																		>
																			<span
																				className="material-icons-round text-xl text-red-500"
																				aria-hidden="true"
																			>
																				delete
																			</span>
																		</button>
																		{image.enAttente && (
																			<span className="absolute bottom-0 left-0 z-40 m-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-indigo-900">
																				À enregistrer
																			</span>
																		)}
																		<Image
																			src={image.url}
																			alt={
																				image.alternativeText ??
																				image.name ??
																				'portefolio image'
																			}
																			fill={true}
																			sizes="(min-width: 480px ) 50vw, (min-width: 728px) 33vw, (min-width: 976px) 25vw, 100vw"
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
																type="button"
																className={
																	'flex min-h-[44px] items-center justify-center gap-2'
																}
																onClick={() => {
																	mySwiperModal?.slidePrev()
																}}
															>
																<Image
																	alt={''}
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
																type="button"
																className={
																	'flex min-h-[44px] items-center justify-center gap-2'
																}
																onClick={() => {
																	mySwiperModal?.slideNext()
																}}
															>
																<span
																	className={'font-semibold text-indigo-950'}
																>
																	Suivant
																</span>
																<Image
																	alt={''}
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
								<div className="mt-4 flex flex-col items-end gap-4">
									<ErreurSauvegarde message={erreurEnvoi} />
									<BoutonSauvegarder
										dataCy="save-button-portefolio"
										envoi={envoi || preparation}
										onClick={handleSubmitGallery}
									/>
								</div>
							</Dialog.Panel>
						</Transition.Child>
					</div>
				</div>
			</Dialog>
		</Transition.Root>
	)
}
