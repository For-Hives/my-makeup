import React, { Fragment, useEffect, useRef, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import { useSession } from 'next-auth/react'
import * as yup from 'yup'
import { useQueryClient } from '@tanstack/react-query'
import { patchMeMakeup } from '@/services/PatchMeMakeup'

const schema = yup.object().shape({
	language: yup.string(),
})

/**
 * ModalUpdateLanguageProfil
 * @param props
 * @constructor
 */
export default function ModalUpdateLanguageProfil(props) {
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

	const [open, setOpen] = useState(props.modalUpdateLanguageProfil)
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
		patchMeMakeup(queryClient, user, session, data_clean)
		reset()
		// close the modal
		props.handleModalUpdateLanguageProfil()
	}

	useEffect(() => {
		setOpen(props.modalUpdateLanguageProfil)
	}, [props.modalUpdateLanguageProfil])

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
			setUserLanguageSelected([
				...userLanguageSelected,
				{
					// id is the name of the skill without the ';' at the end, to be able to delete it later
					id: event.target.value.slice(0, -1),
					name: event.target.value.slice(0, -1),
				},
			])
			setUserLanguage('')
			return
		}
		// check if the entered value is a 'enter' and if so, add it to the array
		setUserLanguage(event.target.value)
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

	return (
		<Transition.Root show={open} as={Fragment}>
			<Dialog
				as="div"
				className="relative z-30"
				initialFocus={cancelButtonRef}
				onClose={props.handleModalUpdateLanguageProfil}
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
					<div className="bg-opalanguage-75 transition-opalanguage fixed inset-0 bg-slate-500" />
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
									type="button"
									onClick={props.handleModalUpdateLanguageProfil}
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
											Les langues que vous pouvez parler
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
															htmlFor="language"
															className="block text-sm text-slate-700"
														>
															Langues
														</label>
														<p className={'text-xs italic text-slate-700/70'}>
															Vous pouvez ajouter plusieurs langues en les
															séparant par un point-virgule, ou en appuyant sur
															la touche entrée.
														</p>
														<div className="mt-2">
															<input
																id="language"
																name="language"
																type={'text'}
																{...register('language', {
																	required: true,
																})}
																required
																onKeyPress={event => {
																	if (event.key === 'Enter') {
																		event.preventDefault()
																		// 	add the skill to the array
																		// 	empty the input
																		setUserLanguageSelected([
																			...userLanguageSelected,
																			{
																				id: event.target.value,
																				name: event.target.value,
																			},
																		])
																		setUserLanguage('')
																	}
																}}
																value={userLanguage ?? ''}
																onChange={handleUpdateLanguage}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm "
															/>
															{errors.language && (
																<p className={'mt-2 text-xs text-red-500/80'}>
																	{errors.language.message}
																</p>
															)}
														</div>
													</div>
													<div className={'flex flex-col gap-2'}>
														<h3 className={'text-sm text-slate-700'}>
															Langues ajoutées
														</h3>
														<div
															className={
																'flex w-full flex-col flex-wrap items-start gap-2 '
															}
														>
															{userLanguageSelected.map((skill, index) => (
																<button
																	type={'button'}
																	onClick={() => {
																		handleDeleteLanguageelected(skill.id)
																	}}
																	key={index}
																	className={
																		'flex items-center gap-2 rounded-full bg-indigo-50 px-2 py-1 text-xs text-slate-700'
																	}
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
