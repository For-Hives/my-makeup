import React, { Fragment, useEffect, useRef, useState } from 'react'
import { Dialog, Switch, Transition } from '@headlessui/react'
import Image from 'next/image'
import { PhotoIcon } from '@heroicons/react/20/solid'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as zod from 'zod'
import { useSession } from 'next-auth/react'
import { BadgeDispo } from '@/components/Profil/Atoms/BadgeDispo'
import { BadgeIndispo } from '@/components/Profil/Atoms/BadgeIndispo'
import { patchMeMakeup } from '@/services/PatchMeMakeup'
import { uploadPhoto } from '@/services/UploadPhoto'
import { ACCEPT } from '@/lib/photo'
import { NOM_MAX, NOM_MIN } from '@/lib/sauvegarde-profil'
import {
	BoutonFermer,
	BoutonSauvegarder,
	ErreurSauvegarde,
	FondModale,
	suivreChamp,
	useEnvoi,
} from '@/components/Profil/Atoms/ModalUpdate/ModalElements'
import { choisirPhoto } from '@/components/Profil/Atoms/ModalUpdate/choisirPhoto'

const schema = zod
	.object({
		first_name: zod
			.string({ required_error: 'Le prénom est requis.' })
			.trim()
			.min(NOM_MIN, `Le prénom doit contenir au moins ${NOM_MIN} caractères.`)
			.max(NOM_MAX, `Le prénom ne doit pas dépasser ${NOM_MAX} caractères.`),
		last_name: zod
			.string({ required_error: 'Le nom est requis.' })
			.trim()
			.min(NOM_MIN, `Le nom doit contenir au moins ${NOM_MIN} caractères.`)
			.max(NOM_MAX, `Le nom ne doit pas dépasser ${NOM_MAX} caractères.`),
		speciality: zod
			.string({ required_error: 'La spécialité est requise.' })
			.min(1, 'La spécialité est requise.')
			.max(70, 'La spécialité ne doit pas dépasser 70 caractères.')
			.or(zod.literal('')),
		company_artist_name: zod
			.string({
				required_error: "Le nom d'entreprise / nom d'artiste est requis.",
			})
			.min(1, "Le nom de l'entreprise est requise.")
			.max(70, "Le nom de l'entreprise ne doit pas dépasser 70 caractères.")
			.or(zod.literal('')),
	})
	.required({
		first_name: true,
		last_name: true,
		speciality: true,
		company_artist_name: true,
	})

export default function ModalUpdateResumeProfil(props) {
	const user = props.user

	const {
		register,
		handleSubmit,
		formState: { errors },
		reset,
	} = useForm({
		resolver: zodResolver(schema),
	})
	const suivre = suivreChamp(register)

	const [open, setOpen] = useState(props.isModalOpen)
	// picked picture, compressed, not sent yet: { fichier, apercu }
	const [photo, setPhoto] = useState(null)
	// picture already sent by a save whose PATCH failed: reused on retry
	const [photoStockee, setPhotoStockee] = useState(null)
	const [erreurPhoto, setErreurPhoto] = useState(null)
	const [preparation, setPreparation] = useState(false)
	// Escape, a click outside and « Fermer » wait for the save in progress
	const { envoi, setEnvoi, erreurEnvoi, setErreurEnvoi, fermer } = useEnvoi(
		props.isModalOpen,
		props.handleIsModalOpen,
		preparation
	)
	const [available, setAvailable] = useState(user.available)
	const [userLastName, setUserLastName] = useState(user.last_name ?? '')
	const [userFirstName, setUserFirstName] = useState(user.first_name ?? '')
	const [userSpeciality, setUserSpeciality] = useState(user.speciality ?? '')
	const [userCompanyOrArtist, setUserCompanyOrArtist] = useState(
		user.company_artist_name ?? ''
	)

	const { data: session } = useSession()

	const imageUrl = photo?.apercu ?? user?.main_picture?.url ?? ''

	// The picture is sent at save time only: closing the modal leaves no
	// file behind on the server (UI-03). The page changes only once the API
	// has stored everything (UI-01).
	const onSubmit = async data => {
		setEnvoi(true)
		setErreurEnvoi(null)

		let stockee = photoStockee
		if (photo && !stockee) {
			const envoiPhoto = await uploadPhoto(session, photo.fichier)
			if (!envoiPhoto.ok) {
				setEnvoi(false)
				setErreurEnvoi(envoiPhoto.error ?? null)
				return
			}
			stockee = envoiPhoto.fichier
			setPhotoStockee(stockee)
		}

		const champs = {
			first_name: data.first_name,
			last_name: data.last_name,
			speciality: data.speciality,
			company_artist_name: data.company_artist_name,
			available: !!available,
		}
		const envoye = stockee ? { ...champs, main_picture: stockee.id } : champs
		const resultat = await patchMeMakeup(session, envoye, 'identite')
		setEnvoi(false)
		if (!resultat.ok) {
			setErreurEnvoi(resultat.error ?? null)
			return
		}

		props.handleUpdateUser({
			...user,
			...champs,
			main_picture: stockee ?? user.main_picture,
		})
		props.handleIsModalOpen()
	}

	useEffect(() => {
		setOpen(props.isModalOpen)
		setAvailable(props.user.available)
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
		setPhotoStockee(null)
		setPhoto({
			fichier: resultat.fichier,
			apercu: URL.createObjectURL(resultat.fichier),
		})
	}

	const handleUpdateLastName = event => {
		setUserLastName(event.target.value)
	}

	const handleUpdateFirstName = event => {
		setUserFirstName(event.target.value)
	}

	const handleUpdateSpeciality = event => {
		setUserSpeciality(event.target.value)
	}

	const handleUpdateCompanyOrArtist = event => {
		setUserCompanyOrArtist(event.target.value)
	}

	const handleUpdateAvailable = event => {
		setAvailable(event)
	}

	useEffect(() => {
		return () => {
			if (photo?.apercu) {
				URL.revokeObjectURL(photo.apercu)
			}
		}
	}, [photo])

	// reset the form when the modal is closed
	useEffect(() => {
		if (!open) {
			setPhoto(null)
			setPhotoStockee(null)
			setErreurPhoto(null)
			setAvailable(user.available)
			setUserLastName(user.last_name ?? '')
			setUserFirstName(user.first_name ?? '')
			setUserSpeciality(user.speciality ?? '')
			setUserCompanyOrArtist(user.company_artist_name ?? '')

			reset()
		}
	}, [
		open,
		reset,
		user.available,
		user.first_name,
		user.last_name,
		user.speciality,
		user.company_artist_name,
	])

	return (
		<Transition.Root show={open} as={Fragment}>
			<Dialog
				as="div"
				className="relative z-30"
				initialFocus={cancelButtonRef}
				onClose={fermer}
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
								className="relative w-full transform rounded-lg bg-white p-8 text-left shadow-2xl transition-all sm:max-w-3xl"
							>
								<BoutonFermer
									onClick={fermer}
									disabled={envoi || preparation}
									ref={cancelButtonRef}
								/>
								<div className="flex flex-col items-start gap-8">
									<div className="text-left">
										<Dialog.Title
											as="h3"
											className="text-lg font-semibold text-gray-900"
										>
											Modifier votre profil
										</Dialog.Title>
									</div>
									<div className={''}>
										<div className="grid grid-cols-1 gap-4">
											<div className={'flex flex-col gap-4'}>
												<label
													htmlFor="photo-profil-upload"
													className="text-base font-normal text-gray-700"
												>
													Modifier votre photo de profil
												</label>
												<button
													type="button"
													data-cy="pick-main-picture"
													aria-label="Choisir une nouvelle photo de profil"
													className="mt-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 sm:col-span-2 sm:mt-0"
													onClick={handleClick}
													disabled={preparation || envoi}
													aria-describedby="photo-profil-aide"
												>
													<div className="relative flex justify-center rounded-lg border border-dashed border-gray-900/25 px-6 py-10">
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
																	sizes="(min-width: 480px ) 50vw, (min-width: 728px) 33vw, (min-width: 976px) 25vw, 100vw"
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
																id="photo-profil-aide"
																className="text-xs leading-5 text-gray-600"
															>
																JPEG, PNG ou WebP, réduite avant l&apos;envoi
															</p>
														</div>
													</div>
												</button>
												<input
													data-cy="file-main-upload"
													id="photo-profil-upload"
													name="photo-profil-upload"
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
																htmlFor="first_name"
																className="block text-sm text-gray-700"
															>
																Prénom
															</label>
															<div className="mt-2">
																<input
																	data-cy="first-name-input"
																	id="first_name"
																	name="first_name"
																	type="text"
																	{...register('first_name', {
																		required: true,
																	})}
																	required
																	value={userFirstName ?? ''}
																	onChange={suivre(
																		'first_name',
																		handleUpdateFirstName
																	)}
																	className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
																/>
																{errors.first_name && (
																	<p
																		data-cy={'error-first-name'}
																		className={'mt-2 text-xs text-red-500/80'}
																	>
																		{errors.first_name.message}
																	</p>
																)}
															</div>
														</div>
														<div>
															<label
																htmlFor="last_name"
																className="block text-sm text-gray-700"
															>
																Nom
															</label>
															<div className="mt-2">
																<input
																	data-cy="last-name-input"
																	id="last_name"
																	name="last_name"
																	type="text"
																	{...register('last_name', {
																		required: true,
																	})}
																	required
																	value={userLastName ?? ''}
																	onChange={suivre(
																		'last_name',
																		handleUpdateLastName
																	)}
																	className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
																/>
																{errors.last_name && (
																	<p
																		data-cy="error-last-name"
																		className={'mt-2 text-xs text-red-500/80'}
																	>
																		{errors.last_name.message}
																	</p>
																)}
															</div>
														</div>
													</div>
													<div>
														<label
															htmlFor="speciality"
															className="block text-sm text-gray-700"
														>
															Specialité
														</label>
														<div className="mt-2">
															<input
																data-cy="speciality-input"
																id="speciality"
																name="speciality"
																type="text"
																{...register('speciality', {
																	required: true,
																})}
																required
																value={userSpeciality ?? ''}
																onChange={suivre(
																	'speciality',
																	handleUpdateSpeciality
																)}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
															/>
															{errors.speciality && (
																<p
																	data-cy="error-speciality"
																	className={'mt-2 text-xs text-red-500/80'}
																>
																	{errors.speciality.message}
																</p>
															)}
														</div>
													</div>
													<div>
														<label
															htmlFor={'company_artist_name'}
															className="block text-sm text-gray-700"
														>
															{"Nom de l'entreprise ou de l'artiste"}
														</label>
														<div className="mt-2">
															<input
																id="company_artist_name"
																data-cy="company-artist-input"
																name="company_artist_name"
																type="text"
																{...register('company_artist_name', {
																	required: true,
																})}
																required
																value={userCompanyOrArtist ?? ''}
																onChange={suivre(
																	'company_artist_name',
																	handleUpdateCompanyOrArtist
																)}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
															/>
															{errors.company_artist_name && (
																<p
																	data-cy={'error-company-artist-name'}
																	className={'mt-2 text-xs text-red-500/80'}
																>
																	{errors.company_artist_name.message}
																</p>
															)}
														</div>
													</div>
													<div>
														<label
															htmlFor="available"
															className="block text-sm text-gray-700"
														>
															Disponibilité
														</label>
														<div className="mt-2 flex items-center gap-4">
															{/* 44 px target around the 20 px track (UI-02); named by
															    its label « Disponibilité » */}
															<Switch
																id="available"
																data-cy="available-input"
																value={available}
																checked={available}
																onChange={handleUpdateAvailable}
																className="group relative inline-flex h-11 w-14 flex-shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
															>
																<span
																	aria-hidden="true"
																	className="pointer-events-none relative inline-flex h-5 w-10 items-center justify-center"
																>
																	<span
																		className={
																			(available
																				? 'bg-indigo-600'
																				: 'bg-gray-200') +
																			' absolute h-4 w-9 rounded-full transition-colors duration-200 ease-in-out'
																		}
																	/>
																	<span
																		className={
																			(available
																				? 'translate-x-5'
																				: 'translate-x-0') +
																			' absolute left-0 inline-block h-5 w-5 transform rounded-full border border-gray-200 bg-white shadow ring-0 transition-transform duration-200 ease-in-out'
																		}
																	/>
																</span>
															</Switch>
															{available ? <BadgeDispo /> : <BadgeIndispo />}
														</div>
													</div>
												</form>
											</div>
										</div>
									</div>
								</div>
								<div className="mt-4 flex flex-col items-end gap-4">
									<ErreurSauvegarde message={erreurEnvoi} />
									<BoutonSauvegarder
										dataCy="save-button-resume"
										envoi={envoi || preparation}
										onClick={handleSubmit(onSubmit)}
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
