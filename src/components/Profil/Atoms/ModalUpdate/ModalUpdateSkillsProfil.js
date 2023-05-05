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
	skills: yup.string().required('La skills est requise'),
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
	} = useForm({
		resolver: yupResolver(schema),
	})

	const [open, setOpen] = useState(props.modalUpdateSkillsProfil)
	const [userSkills, setUserSkills] = useState('')
	const [userSkillsSelected, setUserSkillsSelected] = useState(
		user.skills ?? []
	)

	const { data: session } = useSession()

	const onSubmit = data => {
		data = {
			...user,
			...data,
		}
		putMakeupArtisteViaId(queryClient, user, session, data)

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
		setUserSkills(event.target.value)
	}

	const handleDeleteSkillSelected = id => {
		setUserSkillsSelected(userSkillsSelected.filter(item => item.id !== id))
	}

	return (
		<Transition.Root show={open} as={Fragment}>
			<Dialog
				as="div"
				className="relative z-10"
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

				<div className="fixed inset-0 z-10 overflow-y-auto">
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
											Vous en quelques mots
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
														<div className="mt-2">
															<input
																id="skills"
																name="skills"
																type={'text'}
																{...register('skills', {
																	required: true,
																})}
																required
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
															Compétences ajoutées
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
																	key={skill.id}
																	className={
																		'flex items-center gap-2 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700'
																	}
																>
																	<span>{skill.name}</span>
																	<span className="material-icons-round text-xs">
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
