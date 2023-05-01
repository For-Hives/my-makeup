import { Fragment, useEffect, useRef, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { PhotoIcon } from '@heroicons/react/20/solid'

export default function ModalUpdateResumeProfil(props) {
	const [open, setOpen] = useState(props.modalUpdateResumeProfil)
	const [imageUrl, setImageUrl] = useState(null)

	useEffect(() => {
		setOpen(props.modalUpdateResumeProfil)
	}, [props.modalUpdateResumeProfil])

	const cancelButtonRef = useRef(null)

	const inputRef = useRef(null)

	const handleClick = event => {
		// 👇️ open file input box on click of another element
		// 👇️ trigger click event on input element to open file dialog
		inputRef.current.click()
	}

	const handleFileChange = event => {
		const fileObj = event.target.files && event.target.files[0]
		if (!fileObj) {
			return
		}

		console.log('fileObj is', fileObj)

		// 👇️ reset file input
		event.target.value = null

		// 👇️ is now empty
		console.log(event.target.files)

		// 👇️ can still access file object here
		console.log(fileObj)
		console.log(fileObj.name)
	}

	return (
		<Transition.Root show={open} as={Fragment}>
			<Dialog
				as="div"
				className="relative z-10"
				initialFocus={cancelButtonRef}
				onClose={props.handleModalUpdateResumeProfil}
			>
				<Transition.Child
					as={Fragment}
					enter="ease-out duration-300"
					enterFrom="opacity-0"
					enterTo="opacity-100"
					leave="ease-in duration-200"
					leaveFrom="opacity-100"
					leaveTo="opacity-0"
				>
					<div className="fixed inset-0 bg-slate-500 bg-opacity-75 transition-opacity" />
				</Transition.Child>

				<div className="fixed inset-0 z-10 overflow-y-auto">
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
							<Dialog.Panel className="relative w-full transform rounded-lg bg-white p-8 text-left shadow-2xl transition-all sm:max-w-3xl">
								<button
									type="button"
									onClick={props.handleModalUpdateResumeProfil}
									ref={cancelButtonRef}
									className={
										'absolute right-0 top-0 m-6 flex items-center justify-center'
									}
								>
									<span className="material-symbols-rounded">close</span>
								</button>
								<div className="flex flex-col items-start gap-8">
									<div className="text-left">
										<Dialog.Title
											as="h3"
											className="text-lg font-semibold text-slate-900"
										>
											Modifier votre profil
										</Dialog.Title>
									</div>
									<div>
										<div className="grid grid-cols-1 gap-4 ">
											<label
												htmlFor="cover-photo"
												className="text-base font-normal text-slate-700"
											>
												Modifier votre photo de profil
											</label>
											<button
												className="mt-2 sm:col-span-2 sm:mt-0"
												onClick={handleClick}
											>
												<div className="flex justify-center rounded-lg border border-dashed border-slate-900/25 px-6 py-10">
													<div className="text-center">
														<PhotoIcon
															className="mx-auto h-12 w-12 text-slate-300"
															aria-hidden="true"
														/>
														<div className="mt-4 flex text-sm leading-6 text-slate-600">
															<label className="relative rounded-md bg-white font-semibold text-indigo-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-indigo-600 focus-within:ring-offset-2 hover:text-indigo-500">
																<span>Télécharger une nouvelle photo</span>
															</label>
															<input
																id="file-upload"
																name="file-upload"
																type="file"
																className="sr-only hidden"
																ref={inputRef}
																onChange={handleFileChange}
															/>
														</div>
														<p className="text-xs leading-5 text-slate-600">
															{"PNG, JPG, WEBP jusqu'à 5MB"}
														</p>
													</div>
												</div>
											</button>
										</div>
									</div>
								</div>
								<div className="mt-4 flex justify-end">
									<button
										type="button"
										className="btn-primary"
										onClick={props.handleModalUpdateResumeProfil}
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
