import React, { Fragment, useEffect, useRef, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSession } from 'next-auth/react'
import * as zod from 'zod'
import { patchMeMakeup } from '@/services/PatchMeMakeup'
import {
	BoutonFermer,
	BoutonSauvegarder,
	ErreurSauvegarde,
	FondModale,
	suivreChamp,
	useEnvoi,
} from '@/components/Profil/Atoms/ModalUpdate/ModalElements'

const schema = zod
	.object({
		description: zod
			.string({ required_error: 'La description est requise.' })
			.min(1, 'La description est requise.')
			.max(2000, 'La description ne doit pas dépasser 2000 caractères.')
			.or(zod.literal('')),
	})
	.required({ description: true })

export default function ModalUpdateDescriptionProfil(props) {
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
	const [userDescription, setUserDescription] = useState(user.description ?? '')
	// Escape, a click outside and « Fermer » wait for the save in progress
	const { envoi, setEnvoi, erreurEnvoi, setErreurEnvoi, fermer } = useEnvoi(
		props.isModalOpen,
		props.handleIsModalOpen
	)

	const { data: session } = useSession()

	// the page shows the new text, and the modal closes, once the API stored it
	const onSubmit = async data => {
		setEnvoi(true)
		setErreurEnvoi(null)
		const champs = { description: data.description }
		const resultat = await patchMeMakeup(session, champs, 'description')
		setEnvoi(false)
		if (!resultat.ok) {
			setErreurEnvoi(resultat.message ?? null)
			return
		}
		props.handleUpdateUser({ ...user, ...champs })
		props.handleIsModalOpen()
	}

	const cancelButtonRef = useRef(null)

	const handleUpdateDescription = event => {
		setUserDescription(event.target.value)
	}

	useEffect(() => {
		setOpen(props.isModalOpen)
	}, [props.isModalOpen])

	// reset the form when the modal is closed
	useEffect(() => {
		if (!open) {
			setUserDescription(user.description ?? '')
			reset()
		}
	}, [open, reset, user.description])

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
									disabled={envoi}
									ref={cancelButtonRef}
								/>
								<div className="flex flex-col items-start gap-8">
									<div className="text-left">
										<Dialog.Title
											as="h3"
											className="text-lg font-semibold text-gray-900"
										>
											Vous en quelques mots
										</Dialog.Title>
									</div>
									<div className={'w-full md:w-4/5'}>
										<div className="grid grid-cols-1 gap-4">
											<div className={'flex flex-col gap-4'}>
												<form
													onSubmit={handleSubmit(onSubmit)}
													method="POST"
													className="flex flex-col gap-4"
												>
													<div>
														<label
															htmlFor="description"
															className="block text-sm text-gray-700"
														>
															Description
														</label>
														<div className="mt-2">
															<textarea
																data-cy="description-input"
																id="description"
																name="description"
																{...register('description', {
																	required: true,
																})}
																required
																value={userDescription ?? ''}
																onChange={suivre(
																	'description',
																	handleUpdateDescription
																)}
																className="block min-h-[500px] w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
															/>
															{errors.description && (
																<p
																	data-cy={'error-description'}
																	className={'mt-2 text-xs text-red-500/80'}
																>
																	{errors.description.message}
																</p>
															)}
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
										dataCy="save-button-description"
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
