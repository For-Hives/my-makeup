import React, { Fragment, useEffect, useRef, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useForm, useFormContext } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSession } from 'next-auth/react'
import * as zod from 'zod'
import { patchMeMakeup } from '@/services/PatchMeMakeup'
import {
	BoutonFermer,
	BoutonSauvegarder,
	ErreurSauvegarde,
	FondModale,
} from '@/components/Profil/Atoms/ModalUpdate/ModalElements'

const schema = zod
	.object({
		skills: zod
			.string()
			.min(1, 'Une compétence est requise.')
			.max(70, 'Les compétences ne doivent pas dépasser 70 caractères.')
			.or(zod.literal('')),
	})
	.required({ skills: true })

export default function ModalUpdateSkillsProfil(props) {
	const user = props.user

	const {
		register,
		handleSubmit,
		formState: { errors },
		reset,
		trigger,
		watch,
		setValue,
		setError,
	} = useForm({
		resolver: zodResolver(schema),
	})

	const [open, setOpen] = useState(props.isModalOpen)
	const [userSkills, setUserSkills] = useState('')
	const [userSkillsSelected, setUserSkillsSelected] = useState(
		user.skills ?? []
	)

	const [envoi, setEnvoi] = useState(false)
	const [erreurEnvoi, setErreurEnvoi] = useState(null)

	const { data: session } = useSession()

	/**
	 * onSubmit function called when the form is submitted
	 * @param data
	 */
	const onSubmit = async data => {
		// for each item selected, we only keep the name, the id is not necessary
		const champs = {
			skills: userSkillsSelected.map(item => ({ name: item.name })),
		}
		setEnvoi(true)
		setErreurEnvoi(null)
		const resultat = await patchMeMakeup(session, champs, 'competences')
		setEnvoi(false)
		if (!resultat.ok) {
			setErreurEnvoi(resultat.message ?? null)
			return
		}
		// shown on the page once the API stored it, then the modal closes
		props.handleUpdateUser({ ...user, ...champs })
		props.handleIsModalOpen()
	}

	useEffect(() => {
		setOpen(props.isModalOpen)
	}, [props.isModalOpen])

	const cancelButtonRef = useRef(null)

	const handleUpdateSkills = event => {
		// check if the entered value is a ';' and if so, add it to the array
		if (event.target.value.slice(-1) === ';') {
			if (event.target.value.trim() !== ';') {
				// Trigger a validation before adding the skill
				trigger('skills').then(isValid => {
					if (isValid) {
						const updatedUserSkillsSelected = userSkillsSelected.concat({
							id:
								event.target.value.slice(0, -1) === ';'
									? event.target.value.slice(0, -1)
									: event.target.value,
							name:
								event.target.value.slice(0, -1) === ';'
									? event.target.value.slice(0, -1)
									: event.target.value,
						})
						setUserSkillsSelected(updatedUserSkillsSelected)
						setUserSkills('')
					}
				})
			} else {
				setError('skills', {
					type: 'manual',
					message: 'Une compétence est requise.',
				})
			}
			return
		}

		if (event.target.value.trim() === '') {
			// 	trigger the error message if the input is empty
			setUserSkills(event.target.value)
			setValue('skills', event.target.value)
			setError('skills', {
				type: 'manual',
				message: 'Une compétence est requise.',
			})
		} else {
			setUserSkills(event.target.value)
			setValue('skills', event.target.value)
			trigger('skills')
		}
	}

	const handleDeleteSkillSelected = id => {
		setUserSkillsSelected(userSkillsSelected.filter(item => item.id !== id))
	}

	useEffect(() => {
		if (!open) {
			setUserSkills('')
			setUserSkillsSelected(user.skills ?? [])
			setErreurEnvoi(null)
			reset()
		}
	}, [open, reset, user.skills])

	useEffect(() => {
		if (user && user.skills) {
			// Add an id to each skill
			const skillsWithId = user.skills.map((skill, index) => {
				return {
					id: index, // Use the index as an id
					name: skill.name,
				}
			})
			setUserSkillsSelected(skillsWithId)
		} else {
			setUserSkillsSelected([])
		}
	}, [open, user])

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
								className="relative w-full transform rounded-lg bg-white p-8 text-left shadow-2xl transition-all sm:max-w-3xl"
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
											Vos compétences
										</Dialog.Title>
									</div>
									<div className={'w-full md:w-3/5'}>
										<div className="grid grid-cols-1 gap-4">
											<div className={'flex flex-col gap-4'}>
												<form
													onSubmit={handleSubmit(onSubmit)}
													method="POST"
													className="flex flex-col gap-4"
												>
													<div>
														<label
															htmlFor="skills"
															className="block text-sm text-gray-700"
														>
															Compétences
														</label>
														<p className={'text-xs italic text-gray-700/70'}>
															Vous pouvez ajouter plusieurs compétences en les
															séparant par un point-virgule, ou en appuyant sur
															la touche entrée. Attention, les 7 premières
															compétences seront celles affichées en priorité
															sur votre profil.
														</p>
														<div className="mt-2">
															<input
																data-cy="skills-input"
																id="skills"
																name="skills"
																type={'text'}
																{...register('skills', {
																	required: true,
																})}
																required
																onKeyPress={async event => {
																	if (event.key === 'Enter') {
																		event.preventDefault()
																		// Trigger a validation before adding the skill
																		const isValid = await trigger('skills')
																		if (isValid) {
																			if (event.target.value.trim() !== '') {
																				// 	add the skill to the array
																				// 	empty the input
																				setUserSkillsSelected([
																					...userSkillsSelected,
																					{
																						id: event.target.value,
																						name: event.target.value,
																					},
																				])
																				setUserSkills('')
																			}
																			// 	Display an error message
																			else
																				setError('skills', {
																					type: 'manual',
																					message:
																						'Une compétence est requise.',
																				})
																		}
																	}
																}}
																value={userSkills ?? ''}
																onChange={handleUpdateSkills}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
															/>
															{errors.skills && (
																<p
																	data-cy={'error-skills'}
																	className={'mt-2 text-xs text-red-500/80'}
																>
																	{errors.skills.message}
																</p>
															)}
														</div>
													</div>
													<div className={'flex flex-col gap-2'}>
														<h3 className={'text-sm text-gray-700'}>
															Compétences sélectionnés
														</h3>
														<div
															className={
																'flex w-full flex-wrap items-center gap-2'
															}
														>
															{userSkillsSelected.map((skill, index) => (
																<button
																	data-cy="skill-selected"
																	type={'button'}
																	onClick={() => {
																		handleDeleteSkillSelected(skill.id)
																	}}
																	key={index}
																	aria-label={`Retirer ${skill.name}`}
																	className={
																		'flex min-h-[44px] items-center gap-2 rounded-full bg-gray-100 px-3 text-sm text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600'
																	}
																>
																	<span>{skill.name}</span>
																	<span
																		className="material-icons-round text-sm"
																		aria-hidden="true"
																	>
																		close
																	</span>
																</button>
															))}
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
										dataCy="save-button-skills"
										envoi={envoi}
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
