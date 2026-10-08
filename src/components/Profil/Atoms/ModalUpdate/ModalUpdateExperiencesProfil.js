import React, { Fragment, useEffect, useRef, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSession } from 'next-auth/react'
import * as zod from 'zod'
import { patchMeMakeup } from '@/services/PatchMeMakeup'
import { listeApresSauvegarde } from '@/lib/sauvegarde-profil'
import {
	BoutonFermer,
	BoutonSauvegarder,
	ErreurSauvegarde,
	FondModale,
	suivreChamp,
} from '@/components/Profil/Atoms/ModalUpdate/ModalElements'

const schema = zod
	.object({
		company: zod
			.string({
				required_error: "Le nom de l'entreprise est requise.",
			})
			.min(1, "Le nom de l'entreprise est requis.")
			.max(70, "Le nom de l'entreprise ne doit pas dépasser 70 caractères."),
		job_name: zod
			.string({
				required_error: "Le nom de l'expérience est requis.",
			})
			.min(1, "Le nom de l'expérience est requis.")
			.max(70, "Le nom de l'expérience ne doit pas dépasser 70 caractères."),
		city: zod
			.string({ required_error: 'La ville est requise.' })
			.min(1, 'La ville est requise.')
			.max(70, 'La ville ne doit pas dépasser 70 caractères.'),
		date_start: zod.string({
			required_error: "La date de début de l'expérience est requise.",
		}),
		date_end: zod.string().optional(),
		description: zod
			.string({ required_error: 'La description est requise.' })
			.min(1, 'La description est requise.')
			.max(2000, 'La description ne doit pas dépasser 2000 caractères.'),
	})
	.required({
		company: true,
		job_name: true,
		city: true,
		date_start: true,
		description: true,
	})

// edit and delete buttons of a listed item: 44 px, focus visible (UI-02)
const BOUTON_ICONE =
	'flex h-11 w-11 items-center justify-center rounded-full hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600'

export default function ModalUpdateExperiencesProfil(props) {
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
	// diploma
	// school
	// date_graduation
	// experience_description
	const [userExperiences, setUserExperiences] = useState(user.experiences ?? [])
	const [userExperiencesId, setUserExperiencesId] = useState('')
	const [userExperiencesCompany, setUserExperiencesCompany] = useState('')
	const [userExperiencesJobName, setUserExperiencesJobName] = useState('')
	const [userExperiencesCity, setUserExperiencesCity] = useState('')
	const [userExperiencesDateStart, setUserExperiencesDateStart] = useState('')
	const [userExperiencesDateEnd, setUserExperiencesDateEnd] = useState('')
	const [userExperiencesDescription, setUserExperiencesDescription] =
		useState('')

	const [envoi, setEnvoi] = useState(false)
	const [erreurEnvoi, setErreurEnvoi] = useState(null)

	const { data: session } = useSession()

	/**
	 * onSubmit function called when the form is submitted
	 * @param data
	 */
	const onSubmit = data => {
		// add a new experience to the user courses only if the form is valid
		// check if the experience is already in the user courses
		const experienceAlreadyInUserExperiences = userExperiences.filter(
			experience =>
				experience.company === userExperiencesCompany &&
				experience.job_name === userExperiencesJobName &&
				experience.city === userExperiencesCity &&
				experience.date_start === userExperiencesDateStart &&
				experience.date_end === userExperiencesDateEnd &&
				experience.description === userExperiencesDescription
		)
		// if the experience is not already in the user courses, add it
		if (experienceAlreadyInUserExperiences.length === 0) {
			// if the experience has an id, it's an existing experience
			if (userExperiencesId !== '') {
				// 	then update the experience
				// a new object: the profile of the page stays untouched until saved
				const userExperiencesUpdated = userExperiences.map(experience =>
					experience.id === userExperiencesId
						? {
								...experience,
								company: userExperiencesCompany,
								job_name: userExperiencesJobName,
								city: userExperiencesCity,
								date_start: userExperiencesDateStart,
								date_end: userExperiencesDateEnd,
								description: userExperiencesDescription,
							}
						: experience
				)
				setUserExperiences(userExperiencesUpdated)
				// reset the form
				setUserExperiencesId('')
				setUserExperiencesCompany('')
				setUserExperiencesJobName('')
				setUserExperiencesCity('')
				setUserExperiencesDateStart('')
				setUserExperiencesDateEnd('')
				setUserExperiencesDescription('')
				reset()
			} else {
				if (data) {
					const userExperiencesUpdated = [
						...userExperiences,
						{
							id: 'added' + userExperiencesCompany + userExperiencesJobName,
							company: userExperiencesCompany,
							job_name: userExperiencesJobName,
							city: userExperiencesCity,
							date_start: userExperiencesDateStart,
							date_end: userExperiencesDateEnd,
							description: userExperiencesDescription,
						},
					]
					setUserExperiences(userExperiencesUpdated)
					// reset the form
					setUserExperiencesId('')
					setUserExperiencesCompany('')
					setUserExperiencesJobName('')
					setUserExperiencesCity('')
					setUserExperiencesDateStart('')
					setUserExperiencesDateEnd('')
					setUserExperiencesDescription('')
					reset()
				}
			}
		}
	}

	const handleSubmitExperiences = async event => {
		// clean the experiences, remove the id field
		const userExperiencesCleaned = userExperiences.map(experience => {
			const { id, ...rest } = experience
			// replace the date_end field if it's empty by null
			return rest.date_end === '' ? { ...rest, date_end: null } : rest
		})

		const champs = {
			experiences: userExperiencesCleaned,
		}
		setEnvoi(true)
		setErreurEnvoi(null)
		const resultat = await patchMeMakeup(session, champs, 'experiences')
		setEnvoi(false)
		if (!resultat.ok) {
			setErreurEnvoi(resultat.message ?? null)
			return
		}

		// shown on the page once the API stored it, then the modal closes
		props.handleUpdateUser({
			...user,
			experiences: listeApresSauvegarde(
				resultat.data,
				'experiences',
				userExperiences
			),
		})
		props.handleIsModalOpen()
	}

	useEffect(() => {
		setOpen(props.isModalOpen)
	}, [props.isModalOpen])

	const cancelButtonRef = useRef(null)

	const handleUpdateExperiencesCompany = event => {
		setUserExperiencesCompany(event.target.value)
	}

	const handleUpdateExperiencesJobName = event => {
		setUserExperiencesJobName(event.target.value)
	}

	const handleUpdateExperiencesCity = event => {
		setUserExperiencesCity(event.target.value)
	}

	const handleUpdateExperiencesDateStart = event => {
		setUserExperiencesDateStart(event.target.value)
	}

	const handleUpdateExperiencesDateEnd = event => {
		setUserExperiencesDateEnd(event.target.value)
	}

	const handleUpdateExperiencesDescription = event => {
		setUserExperiencesDescription(event.target.value)
	}

	const handleDeleteExperience = id => {
		const userExperiencesFiltered = userExperiences.filter(
			experience => experience.id !== id
		)
		setUserExperiences(userExperiencesFiltered)
	}

	const handleEditExperience = id => {
		const userExperiencesToUpdate = userExperiences.filter(
			experience => experience.id === id
		)
		reset()
		setUserExperiencesId(userExperiencesToUpdate[0].id)
		setUserExperiencesCompany(userExperiencesToUpdate[0].company)
		setUserExperiencesJobName(userExperiencesToUpdate[0].job_name)
		setUserExperiencesCity(userExperiencesToUpdate[0].city)
		setUserExperiencesDateStart(userExperiencesToUpdate[0].date_start)
		setUserExperiencesDateEnd(userExperiencesToUpdate[0].date_end)
		setUserExperiencesDescription(userExperiencesToUpdate[0].description)
	}

	// reset the form when the modal is closed: what was changed without
	// saving is dropped (RG-03)
	useEffect(() => {
		if (!open) {
			setUserExperiences(user.experiences ?? [])
			setErreurEnvoi(null)
			setUserExperiencesId('')
			setUserExperiencesCompany('')
			setUserExperiencesJobName('')
			setUserExperiencesCity('')
			setUserExperiencesDateStart('')
			setUserExperiencesDateEnd('')
			setUserExperiencesDescription('')
			reset()
		}
	}, [open, reset, user.experiences])

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
								<div className="flex flex-col items-start gap-8">
									<div className="text-left">
										<Dialog.Title
											as="h3"
											className="text-lg font-semibold text-gray-900"
										>
											Les expériences professionnelles que vous avez
										</Dialog.Title>
									</div>
									<div
										className={
											'flex h-full w-full flex-wrap gap-16 md:flex-nowrap'
										}
									>
										<div className={'w-full md:w-2/5'}>
											<div className="grid grid-cols-1 gap-4">
												<div className={'flex flex-col gap-4'}>
													<form
														onSubmit={handleSubmit(onSubmit)}
														method="POST"
														className="flex flex-col gap-4"
													>
														<div>
															<label
																htmlFor="company"
																className="block text-sm text-gray-700"
															>
																{"Nom de l'entreprise"}
															</label>
															<div className="mt-2">
																<input
																	data-cy="company-input"
																	id="company"
																	name="company"
																	type={'text'}
																	{...register('company', {
																		required: true,
																	})}
																	required
																	value={userExperiencesCompany ?? ''}
																	onChange={suivre(
																		'company',
																		handleUpdateExperiencesCompany
																	)}
																	className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
																/>
																{errors.company && (
																	<p
																		data-cy={'error-company'}
																		className={'mt-2 text-xs text-red-500/80'}
																	>
																		{errors.company.message}
																	</p>
																)}
															</div>
														</div>
														<div>
															<label
																htmlFor="job_name"
																className="block text-sm text-gray-700"
															>
																Nom du poste
															</label>
															<div className="mt-2">
																<input
																	data-cy="job-name-input"
																	id="job_name"
																	name="job_name"
																	type={'text'}
																	{...register('job_name', {
																		required: true,
																	})}
																	required
																	value={userExperiencesJobName ?? ''}
																	onChange={suivre(
																		'job_name',
																		handleUpdateExperiencesJobName
																	)}
																	className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
																/>
																{errors.job_name && (
																	<p
																		data-cy={'error-job-name'}
																		className={'mt-2 text-xs text-red-500/80'}
																	>
																		{errors.job_name.message}
																	</p>
																)}
															</div>
														</div>
														<div>
															<label
																htmlFor="city"
																className="block text-sm text-gray-700"
															>
																Nom de la ville
															</label>
															<div className="mt-2">
																<input
																	data-cy="city-input"
																	id="city"
																	name="city"
																	type={'text'}
																	{...register('city', {
																		required: true,
																	})}
																	required
																	value={userExperiencesCity ?? ''}
																	onChange={suivre(
																		'city',
																		handleUpdateExperiencesCity
																	)}
																	className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
																/>
																{errors.city && (
																	<p
																		data-cy={'error-city'}
																		className={'mt-2 text-xs text-red-500/80'}
																	>
																		{errors.city.message}
																	</p>
																)}
															</div>
														</div>
														<div>
															<label
																htmlFor="date_start"
																className="block text-sm text-gray-700"
															>
																Date de début
															</label>
															<div className="mt-2">
																<input
																	data-cy="date-start-input"
																	id="date_start"
																	name="date_start"
																	type={'date'}
																	{...register('date_start', {
																		required: true,
																	})}
																	required
																	value={userExperiencesDateStart ?? ''}
																	onChange={suivre(
																		'date_start',
																		handleUpdateExperiencesDateStart
																	)}
																	className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
																/>
																{errors.date_start && (
																	<p
																		data-cy={'error-date-start'}
																		className={'mt-2 text-xs text-red-500/80'}
																	>
																		{errors.date_start.message}
																	</p>
																)}
															</div>
														</div>
														<div>
															<label
																htmlFor="date_end"
																className="block text-sm text-gray-700"
															>
																Date de fin (laisser vide si toujours en poste)
															</label>
															<div className="mt-2">
																<input
																	data-cy="date-end-input"
																	id="date_end"
																	name="date_end"
																	type={'date'}
																	{...register('date_end')}
																	value={userExperiencesDateEnd ?? ''}
																	onChange={suivre(
																		'date_end',
																		handleUpdateExperiencesDateEnd
																	)}
																	className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
																/>
																{errors.date_end && (
																	<p
																		data-cy={'error-date-end'}
																		className={'mt-2 text-xs text-red-500/80'}
																	>
																		{errors.date_end.message}
																	</p>
																)}
															</div>
														</div>
														<div>
															<label
																htmlFor="description"
																className="block text-sm text-gray-700"
															>
																{"Description de l'expérience"}
															</label>
															<div className="mt-2">
																<textarea
																	data-cy="description-experience-input"
																	id="description"
																	name="description"
																	{...register('description', {
																		required: true,
																	})}
																	required
																	value={userExperiencesDescription ?? ''}
																	onChange={suivre(
																		'description',
																		handleUpdateExperiencesDescription
																	)}
																	className="block min-h-[150px] w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
																/>
																{errors.description && (
																	<p
																		data-cy={'error-description-experience'}
																		className={'mt-2 text-xs text-red-500/80'}
																	>
																		{errors.description.message}
																	</p>
																)}
															</div>
														</div>
													</form>
													<div className={'flex items-center justify-end'}>
														<button
															data-cy="add-experience-button"
															type="button"
															className="btn-primary"
															onClick={handleSubmit(onSubmit)}
														>
															{userExperiencesId === ''
																? 'Ajouter une expérience'
																: 'Modifier une expérience'}
														</button>
													</div>
												</div>
											</div>
										</div>
										<div
											className={'flex w-full flex-col gap-8 md:w-3/5 md:gap-4'}
										>
											{/*	display the experiences already added */}
											<h3 className={'text-sm text-gray-900'}>
												Les expériences déjà ajoutées
											</h3>
											<div
												className={
													'flex max-h-[600px] w-full flex-col gap-4 overflow-y-scroll pt-4 md:pt-0'
												}
											>
												{userExperiences.map((experience, index) => {
													return (
														<div
															key={index}
															className={
																'relative flex w-full rounded bg-indigo-50/20 p-4 pt-8 text-gray-700 md:pt-4'
															}
														>
															<div
																className={
																	'absolute -top-2 right-0 m-2 flex items-center justify-center gap-4 md:top-0'
																}
															>
																<button
																	type="button"
																	data-cy={`experience-selected-${index}`}
																	aria-label={`Modifier l'expérience ${experience.company ?? ''}`}
																	className={BOUTON_ICONE}
																	onClick={() =>
																		handleEditExperience(experience.id)
																	}
																>
																	<span
																		className="material-icons-round text-xl text-orange-600"
																		aria-hidden="true"
																	>
																		edit
																	</span>
																</button>
																<button
																	type="button"
																	data-cy={'experience-selected'}
																	aria-label={`Retirer l'expérience ${experience.company ?? ''}`}
																	className={BOUTON_ICONE}
																	onClick={() =>
																		handleDeleteExperience(experience.id)
																	}
																>
																	<span
																		className="material-icons-round text-xl text-red-500"
																		aria-hidden="true"
																	>
																		delete
																	</span>
																</button>
															</div>
															<span className="material-icons-round">
																apartment
															</span>
															<div
																className={'ml-2 flex w-full flex-col gap-2'}
															>
																<div className={'flex w-full flex-col'}>
																	<p className={'font-semibold text-gray-700'}>
																		{experience.company}
																	</p>
																	<div
																		className={'flex w-full justify-between'}
																	>
																		<p
																			className={'text-sm italic text-gray-600'}
																		>
																			{experience.job_name}
																		</p>
																		<p
																			className={'text-sm italic text-gray-600'}
																		>
																			{/* format date to month year ( like july 1998 )  */}
																			{/*{experience.date_start} - {experience.date_end}*/}
																			{new Date(
																				experience.date_start
																			).toLocaleString('fr-FR', {
																				year: 'numeric',
																				month: 'long',
																			})}
																			{' - '}
																			{experience.date_end === null ||
																			experience.date_end === ''
																				? "Aujourd'hui"
																				: new Date(
																						experience.date_end
																					).toLocaleString('fr-FR', {
																						year: 'numeric',
																						month: 'long',
																					})}
																		</p>
																	</div>
																</div>
																<div>
																	<p className={'text-sm italic text-gray-500'}>
																		{experience.description}
																	</p>
																</div>
															</div>
														</div>
													)
												})}
											</div>
										</div>
									</div>
								</div>
								<div className="mt-4 flex flex-col items-end gap-4">
									<ErreurSauvegarde message={erreurEnvoi} />
									<BoutonSauvegarder
										dataCy="save-button-experience"
										envoi={envoi}
										onClick={handleSubmitExperiences}
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
