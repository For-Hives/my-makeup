import React, { Fragment, useEffect, useRef, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import { useSession } from 'next-auth/react'
import * as yup from 'yup'
import { useQueryClient } from '@tanstack/react-query'
import { patchMeMakeup } from '@/services/PatchMeMakeup'

const schema = yup.object().shape({
	skills: yup.string(),
})

/**
 * ModalUpdateSkillsProfil
 * @param props
 * @constructor
 */
export default function ModalUpdateSkillsProfil(props) {
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

	const [open, setOpen] = useState(props.modalUpdateSkillsProfil)
	const [userSkills, setUserSkills] = useState('')
	const [userSkillsSelected, setUserSkillsSelected] = useState(
		user.skills ?? []
	)

	const { data: session } = useSession()

	/**
	 * onSubmit function called when the form is submitted
	 * @param data
	 */
	const onSubmit = data => {
		// for each skill selected, we only keep the name, the id is not necessary
		const userSkillsSelectedCleaned = userSkillsSelected.map(item => {
			return {
				name: item.name,
			}
		})
		const data_clean = {
			skills: userSkillsSelectedCleaned,
		}
		patchMeMakeup(queryClient, user, session, data_clean)
		reset()
		// close the modal
		props.handleModalUpdateSkillsProfil()
	}

	useEffect(() => {
		setOpen(props.modalUpdateSkillsProfil)
	}, [props.modalUpdateSkillsProfil])

	const cancelButtonRef = useRef(null)
	const inputRef = useRef(null)

	const handleClick = event => {
		// 👇️ open file input box on click of another element
		// 👇️ trigger click event on input element to open file dialog
		inputRef.current.click()
	}

	const handleUpdateSkills = event => {
		// check if the entered value is a ';' and if so, add it to the array
		if (event.target.value.slice(-1) === ';') {
			setUserSkillsSelected([
				...userSkillsSelected,
				{
					// id is the name of the skill without the ';' at the end, to be able to delete it later
					id: event.target.value.slice(0, -1),
					name: event.target.value.slice(0, -1),
				},
			])
			setUserSkills('')
			return
		}
		// check if the entered value is a 'enter' and if so, add it to the array
		setUserSkills(event.target.value)
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

	return (
		<Transition.Root show={open} as={Fragment}>
			<Dialog
				as="div"
				className="relative z-30"
				initialFocus={cancelButtonRef}
				onClose={props.handleModalUpdateSkillsProfil}
			>
				<Transition.Child
					as={Fragment}
					enter="ease-out duration-300"
					enterFrom="opaskills-0"
					enterTo="opaskills-100"
					leave="ease-in duration-200"
					leaveFrom="opaskills-100"
					leaveTo="opaskills-0"
				>
					<div className="bg-opaskills-75 transition-opaskills fixed inset-0 bg-slate-500" />
				</Transition.Child>

				<div className="fixed inset-0 z-30 overflow-y-auto">
					<div className="flex min-h-full items-center justify-center p-4 text-center">
						<Transition.Child
							as={Fragment}
							enter="ease-out duration-300"
							enterFrom="opaskills-0 translate-y-4 sm:translate-y-0 sm:scale-95"
							enterTo="opaskills-100 translate-y-0 sm:scale-100"
							leave="ease-in duration-200"
							leaveFrom="opaskills-100 translate-y-0 sm:scale-100"
							leaveTo="opaskills-0 translate-y-4 sm:translate-y-0 sm:scale-95"
						>
							<Dialog.Panel className="relative w-full transform rounded-lg bg-white p-8 text-left shadow-2xl transition-all sm:max-w-3xl">
								<button
									type="button"
									onClick={props.handleModalUpdateSkillsProfil}
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
											Vos compétences
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
															htmlFor="skills"
															className="block text-sm text-slate-700"
														>
															Skills
														</label>
														<p className={'text-xs italic text-slate-700/70'}>
															Vous pouvez ajouter plusieurs compétences en les
															séparant par un point-virgule, ou en appuyant sur
															la touche entrée.
														</p>
														<div className="mt-2">
															<input
																id="skills"
																name="skills"
																type={'text'}
																{...register('skills', {
																	required: true,
																})}
																required
																onKeyPress={event => {
																	if (event.key === 'Enter') {
																		event.preventDefault()
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
																}}
																value={userSkills ?? ''}
																onChange={handleUpdateSkills}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm "
															/>
															{errors.skills && (
																<p className={'mt-2 text-xs text-red-500/80'}>
																	{errors.skills.message}
																</p>
															)}
														</div>
													</div>
													<div className={'flex flex-col gap-2'}>
														<h3 className={'text-sm text-slate-700'}>
															Compétences
														</h3>
														<div
															className={
																'flex w-full flex-wrap items-center gap-2 '
															}
														>
															{userSkillsSelected.map((skill, index) => (
																<button
																	type={'button'}
																	onClick={() => {
																		handleDeleteSkillSelected(skill.id)
																	}}
																	key={index}
																	className={
																		'flex items-center gap-2 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700'
																	}
																>
																	<span>{skill.name}</span>
																	<span className="material-icons-round text-sm">
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
