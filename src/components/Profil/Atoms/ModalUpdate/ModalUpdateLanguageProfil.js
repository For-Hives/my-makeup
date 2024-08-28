import React, { Fragment, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'

import { Dialog, Transition } from '@headlessui/react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSession } from 'next-auth/react'
import * as zod from 'zod'

import { patchMeMakeup } from '@/services/PatchMeMakeup'

const schema = zod
	.object({
		language: zod
			.string()
			.min(1, 'La langue est requise.')
			.max(70, 'La langue ne doit pas dépasser 70 caractères.')
			.or(zod.literal('')),
	})
	.required({ language: true })

export default function ModalUpdateLanguageProfil(props) {
	const user = props.user

	const {
		formState: { errors },
		handleSubmit,
		register,
		setValue,
		setError,
		trigger,
		reset,
	} = useForm({
		resolver: zodResolver(schema),
	})

	const [open, setOpen] = useState(props.isModalOpen)
	const [userLanguage, setUserLanguage] = useState('')
	const [userLanguageSelected, setUserLanguageSelected] = useState(
		user.language ?? []
	)

	const { data: session } = useSession()

	/**
	 * onSubmit function called when the form is submitted
	 * @param data
	 */
	const onSubmit = data => {
		// for each skill selected, we only keep the name, the id is not necessary
		const userLanguageSelectedCleaned = userLanguageSelected.map(item => {
			return {
				name: item.name,
			}
		})
		const data_clean = {
			language: userLanguageSelectedCleaned,
		}
		patchMeMakeup(session, data_clean)

		let userTemp = user
		userTemp.language = userLanguageSelectedCleaned
		// to change to object reference
		const newUser = JSON.parse(JSON.stringify(userTemp))
		props.handleUpdateUser(newUser)

		reset()
		// close the modal
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

	const handleUpdateLanguage = event => {
		// check if the entered value is a ';' and if so, add it to the array
		if (event.target.value.slice(-1) === ';') {
			if (event.target.value.trim() !== ';') {
				// Trigger a validation before adding the skill
				trigger('language').then(isValid => {
					if (isValid) {
						const updatedUserLanguagesSelected = userLanguageSelected.concat({
							name:
								event.target.value.slice(0, -1) === ';'
									? event.target.value.slice(0, -1)
									: event.target.value,
							id:
								event.target.value.slice(0, -1) === ';'
									? event.target.value.slice(0, -1)
									: event.target.value,
						})
						setUserLanguageSelected(updatedUserLanguagesSelected)
						setUserLanguage('')
					}
				})
			} else {
				setError('language', {
					message: 'La langue est requise.',
					type: 'manual',
				})
			}
			return
		}

		if (event.target.value.trim() === '') {
			// 	trigger the error message if the input is empty
			setUserLanguage(event.target.value)
			setValue('language', event.target.value)
			setError('language', {
				message: 'La langue est requise.',
				type: 'manual',
			})
		} else {
			setUserLanguage(event.target.value)
			setValue('language', event.target.value)
			trigger('language')
		}
	}

	const handleDeleteLanguageelected = id => {
		setUserLanguageSelected(userLanguageSelected.filter(item => item.id !== id))
	}

	// reset the form when the modal is closed
	useEffect(() => {
		if (!open) {
			setUserLanguage('')
			setUserLanguageSelected(user.language ?? [])
			reset()
		}
	}, [open, reset, user.language])

	useEffect(() => {
		if (user && user.language) {
			// Add an id to each skill
			const languagesWithId = user.language.map((language, index) => {
				return {
					name: language.name,
					id: index, // Use the index as an id
				}
			})
			setUserLanguageSelected(languagesWithId)
		} else {
			setUserLanguageSelected([])
		}
	}, [open, user])

	return (
		<Transition.Root as={Fragment} show={open}>
			<Dialog
				as="div"
				className="relative z-30"
				initialFocus={cancelButtonRef}
				onClose={props.handleIsModalOpen}
			>
				<Transition.Child
					as={Fragment}
					enter="ease-out duration-300"
					enterFrom="opalanguage-0"
					enterTo="opalanguage-100"
					leave="ease-in duration-200"
					leaveFrom="opalanguage-100"
					leaveTo="opalanguage-0"
				>
					<div className="bg-opalanguage-75 transition-opalanguage fixed inset-0 bg-gray-500" />
				</Transition.Child>

				<div className="fixed inset-0 z-30 overflow-y-auto">
					<div className="flex min-h-full items-center justify-center p-4 text-center">
						<Transition.Child
							as={Fragment}
							enter="ease-out duration-300"
							enterFrom="opalanguage-0 translate-y-4 sm:translate-y-0 sm:scale-95"
							enterTo="opalanguage-100 translate-y-0 sm:scale-100"
							leave="ease-in duration-200"
							leaveFrom="opalanguage-100 translate-y-0 sm:scale-100"
							leaveTo="opalanguage-0 translate-y-4 sm:translate-y-0 sm:scale-95"
						>
							<Dialog.Panel className="relative w-full transform rounded-lg bg-white p-8 text-left shadow-2xl transition-all sm:max-w-3xl">
								<button
									className={
										'absolute right-0 top-0 m-6 flex items-center justify-center'
									}
									onClick={props.handleIsModalOpen}
									ref={cancelButtonRef}
									type="button"
								>
									<span className="material-icons-round">close</span>
								</button>
								<div className="flex flex-col items-start gap-8">
									<div className="text-left">
										<Dialog.Title
											as="h3"
											className="text-lg font-semibold text-gray-900"
										>
											Les langues que vous pouvez parler
										</Dialog.Title>
									</div>
									<div className={'w-full md:w-3/5'}>
										<div className="grid grid-cols-1 gap-4">
											<div className={'flex flex-col gap-4'}>
												<form
													className="flex flex-col gap-4"
													method="POST"
													onSubmit={handleSubmit(onSubmit)}
												>
													<div>
														<label
															className="block text-sm text-gray-700"
															htmlFor="language"
														>
															Langues
														</label>
														<p className={'text-xs italic text-gray-700/70'}>
															Vous pouvez ajouter plusieurs langues en les
															séparant par un point-virgule, ou en appuyant sur
															la touche entrée.
														</p>
														<div className="mt-2">
															<input
																data-cy="language-input"
																id="language"
																name="language"
																type={'text'}
																{...register('language', {
																	required: true,
																})}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
																onChange={handleUpdateLanguage}
																onKeyPress={async event => {
																	if (event.key === 'Enter') {
																		event.preventDefault()
																		// Trigger a validation before adding the skill
																		const isValid = await trigger('language')
																		if (isValid) {
																			if (event.target.value.trim() !== '') {
																				// 	add the skill to the array
																				// 	empty the input
																				setUserLanguageSelected([
																					...userLanguageSelected,
																					{
																						name: event.target.value,
																						id: event.target.value,
																					},
																				])
																				setUserLanguage('')
																			} else {
																				setError('language', {
																					message: 'La langue est requise.',
																					type: 'manual',
																				})
																			}
																		}
																	}
																}}
																required
																value={userLanguage ?? ''}
															/>
															{errors.language && (
																<p
																	className={'mt-2 text-xs text-red-500/80'}
																	data-cy={'error-language'}
																>
																	{errors.language.message}
																</p>
															)}
														</div>
													</div>
													<div className={'flex flex-col gap-2'}>
														<h3 className={'text-sm text-gray-700'}>
															Langues ajoutées
														</h3>
														<div
															className={
																'flex w-full flex-col flex-wrap items-start gap-2'
															}
														>
															{userLanguageSelected.map((skill, index) => (
																<button
																	className={
																		'flex items-center gap-2 rounded-full bg-indigo-50 px-2 py-1 text-xs text-gray-700'
																	}
																	data-cy="language-selected"
																	key={index}
																	onClick={() => {
																		handleDeleteLanguageelected(skill.id)
																	}}
																	type={'button'}
																>
																	<span>→ {skill.name}</span>
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
										className="btn-primary"
										data-cy="save-button-languages"
										onClick={handleSubmit(onSubmit)}
										type="button"
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
