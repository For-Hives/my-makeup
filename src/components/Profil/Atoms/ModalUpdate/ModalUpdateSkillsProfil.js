import { Dialog, Transition } from '@headlessui/react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSession } from 'next-auth/react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import * as zod from 'zod'
import {
	BoutonFermer,
	BoutonSauvegarder,
	ErreurSauvegarde,
	FondModale,
	focusApresRetrait,
	ignorerEntreeMaintenue,
	useEnvoi,
} from '@/components/Profil/Atoms/ModalUpdate/ModalElements'
import { dejaDansLaListe } from '@/lib/sauvegarde-profil'
import { patchMeMakeup } from '@/services/PatchMeMakeup'

const schema = zod
	.object({
		skills: zod
			.string()
			.min(1, 'Une compétence est requise.')
			.max(70, 'Les compétences ne doivent pas dépasser 70 caractères.')
			.or(zod.literal('')),
	})
	.required({ skills: true })

// A skill added in the modal has no id yet, and « Retirer » finds a chip by
// its id: it gets a local one that no other chip can share. Its name was its
// id, so two chips with the same name were removed together. Never sent: the
// PATCH holds the names only (onSubmit).
let compteurLocal = 0

// A name already in the list (dejaDansLaListe) is not added a second time:
// said under the field, where the name stays. The chips stored twice before
// that stay as they are, each removed on its own.
const DEJA_DANS_LA_LISTE = 'Cette compétence est déjà dans la liste.'

export default function ModalUpdateSkillsProfil(props) {
	const user = props.user

	const {
		register,
		handleSubmit,
		formState: { errors },
		reset,
		trigger,
		setValue,
		setError,
	} = useForm({
		resolver: zodResolver(schema),
	})

	const [open, setOpen] = useState(props.isModalOpen)
	const [userSkills, setUserSkills] = useState('')
	const [userSkillsSelected, setUserSkillsSelected] = useState(user.skills ?? [])

	// Escape, a click outside and « Fermer » wait for the save in progress
	const { envoi, setEnvoi, erreurEnvoi, setErreurEnvoi, fermer } = useEnvoi(props.isModalOpen, props.handleIsModalOpen)

	const { data: session } = useSession()

	/**
	 * onSubmit function called when the form is submitted
	 * @param data
	 */
	const onSubmit = async _data => {
		// for each item selected, we only keep the name, the id is not necessary
		const champs = {
			skills: userSkillsSelected.map(item => ({ name: item.name })),
		}
		setEnvoi(true)
		setErreurEnvoi(null)
		const resultat = await patchMeMakeup(session, champs, 'competences')
		setEnvoi(false)
		if (!resultat.ok) {
			setErreurEnvoi(resultat.error ?? null)
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
	// where the keyboard focus goes when the list is left empty (focusApresRetrait)
	const champCompetence = useRef(null)
	const { ref: enregistrerChamp, ...champEnregistre } = register('skills', {
		required: true,
	})

	const handleUpdateSkills = event => {
		// check if the entered value is a ';' and if so, add it to the array
		if (event.target.value.slice(-1) === ';') {
			// the skill typed before the separator, without it
			const nom = event.target.value.slice(0, -1).trim()
			if (nom !== '') {
				// the name itself is checked (70 characters at most), even when
				// pasted with its ';' in one go, then added
				setValue('skills', nom)
				trigger('skills').then(isValid => {
					const doublon = isValid && dejaDansLaListe(userSkillsSelected, nom)
					if (isValid && !doublon) {
						setUserSkillsSelected(userSkillsSelected.concat({ id: `local-${++compteurLocal}`, name: nom }))
						setUserSkills('')
					} else setUserSkills(nom)
					if (doublon) setError('skills', { type: 'manual', message: DEJA_DANS_LA_LISTE })
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
			reset()
		}
	}, [open, reset, user.skills])

	useEffect(() => {
		if (user?.skills) {
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
			<Dialog as="div" className="relative z-30" initialFocus={cancelButtonRef} onClose={fermer}>
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
								onKeyDownCapture={ignorerEntreeMaintenue}
								className="relative w-full transform rounded-lg bg-white p-8 text-left shadow-2xl transition-all sm:max-w-3xl"
							>
								<BoutonFermer onClick={fermer} disabled={envoi} ref={cancelButtonRef} />
								<div className="flex flex-col items-start gap-8">
									<div className="text-left">
										<Dialog.Title as="h3" className="text-lg font-semibold text-gray-900">
											Vos compétences
										</Dialog.Title>
									</div>
									<div className={'w-full md:w-3/5'}>
										<div className="grid grid-cols-1 gap-4">
											<div className={'flex flex-col gap-4'}>
												<form onSubmit={handleSubmit(onSubmit)} method="POST" className="flex flex-col gap-4">
													<div>
														<label htmlFor="skills" className="block text-sm text-gray-700">
															Compétences
														</label>
														<p className={'text-xs italic text-gray-700/70'}>
															Vous pouvez ajouter plusieurs compétences en les séparant par un point-virgule, ou en
															appuyant sur la touche entrée. Attention, les 7 premières compétences seront celles
															affichées en priorité sur votre profil.
														</p>
														<div className="mt-2">
															<input
																data-cy="skills-input"
																id="skills"
																name="skills"
																type={'text'}
																{...champEnregistre}
																ref={noeud => {
																	enregistrerChamp(noeud)
																	champCompetence.current = noeud
																}}
																required
																// its message is read with the field
																aria-invalid={!!errors.skills}
																aria-describedby={errors.skills ? 'skills-erreur' : undefined}
																onKeyPress={async event => {
																	if (event.key === 'Enter') {
																		event.preventDefault()
																		// Enter held on the only chip repeats here once the field
																		// has the focus: nothing was typed, no message to show
																		if (event.repeat) return
																		// Trigger a validation before adding the skill
																		const isValid = await trigger('skills')
																		if (isValid) {
																			if (dejaDansLaListe(userSkillsSelected, event.target.value)) {
																				setError('skills', {
																					type: 'manual',
																					message: DEJA_DANS_LA_LISTE,
																				})
																			} else if (event.target.value.trim() !== '') {
																				// 	add the skill to the array
																				// 	empty the input
																				setUserSkillsSelected([
																					...userSkillsSelected,
																					{
																						id: `local-${++compteurLocal}`,
																						name: event.target.value,
																					},
																				])
																				setUserSkills('')
																			}
																			// 	Display an error message
																			else
																				setError('skills', {
																					type: 'manual',
																					message: 'Une compétence est requise.',
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
																	id="skills-erreur"
																	data-cy={'error-skills'}
																	className={'mt-2 text-xs text-red-500/80'}
																>
																	{errors.skills.message}
																</p>
															)}
														</div>
													</div>
													<div className={'flex flex-col gap-2'}>
														<h3 className={'text-sm text-gray-700'}>Compétences sélectionnés</h3>
														<div className={'flex w-full flex-wrap items-center gap-2'}>
															{userSkillsSelected.map((skill, index) => (
																<button
																	data-cy="skill-selected"
																	type={'button'}
																	// the chip is the row and its « Retirer »
																	data-ligne
																	data-retirer
																	onClick={event => {
																		// detail 0: Enter or Space. A tap must not focus the
																		// field: the virtual keyboard of a phone would open.
																		const repli = event.detail === 0 ? champCompetence.current : null
																		focusApresRetrait(event.currentTarget, repli)
																		handleDeleteSkillSelected(skill.id)
																	}}
																	// biome-ignore lint/suspicious/noArrayIndexKey: the row keeps its node when another is removed, so the keyboard focus stays in the list
																	key={index}
																	aria-label={`Retirer ${skill.name}`}
																	className={
																		'flex min-h-[44px] items-center gap-2 rounded-full bg-gray-100 px-3 text-sm text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600'
																	}
																>
																	<span>{skill.name}</span>
																	<span className="material-icons-round text-sm" aria-hidden="true">
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
									<BoutonSauvegarder dataCy="save-button-skills" envoi={envoi} onClick={handleSubmit(onSubmit)} />
								</div>
							</Dialog.Panel>
						</Transition.Child>
					</div>
				</div>
			</Dialog>
		</Transition.Root>
	)
}
