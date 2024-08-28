import React, { Fragment, useRef, useState } from 'react'

import {
	ArrowRightOnRectangleIcon,
	UserMinusIcon,
} from '@heroicons/react/20/solid'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { Dialog, Transition } from '@headlessui/react'
import { signOut } from 'next-auth/react'
import { useRouter } from 'next/router'

import { DeleteMeMakeup } from '@/services/DeleteMeMakeup'

function DangerZone(props) {
	const [open, setOpen] = useState(false)

	const cancelButtonRef = useRef(null)
	const router = useRouter()

	const handleDeleteAccount = () => {
		DeleteMeMakeup(props.session)
		signOut()
	}

	return (
		<>
			<Transition.Root as={Fragment} show={open}>
				<Dialog
					as="div"
					className="relative z-30"
					initialFocus={cancelButtonRef}
					onClose={setOpen}
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
						<div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
					</Transition.Child>

					<div className="fixed inset-0 z-10 overflow-y-auto">
						<div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
							<Transition.Child
								as={Fragment}
								enter="ease-out duration-300"
								enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
								enterTo="opacity-100 translate-y-0 sm:scale-100"
								leave="ease-in duration-200"
								leaveFrom="opacity-100 translate-y-0 sm:scale-100"
								leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
							>
								<Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
									<div className="sm:flex sm:items-start">
										<div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
											<ExclamationTriangleIcon
												aria-hidden="true"
												className="h-6 w-6 text-red-600"
											/>
										</div>
										<div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
											<Dialog.Title
												as="h3"
												className="text-base font-semibold leading-6 text-gray-900"
											>
												Supprimer mon compte
											</Dialog.Title>
											<div className="mt-2">
												<p className="text-sm text-gray-500">
													Êtes-vous sûr de vouloir supprimer votre compte ?
													Toutes vos données seront supprimées de nos serveurs
													pour toujours. Cette action est irréversible.
												</p>
											</div>
										</div>
									</div>
									<div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
										<button
											className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:ml-3 sm:w-auto"
											data-cy={'delete-account'}
											onClick={handleDeleteAccount}
											type="button"
										>
											Supprimer
										</button>
										<button
											className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
											onClick={() => setOpen(false)}
											ref={cancelButtonRef}
											type="button"
										>
											Annuler
										</button>
									</div>
								</Dialog.Panel>
							</Transition.Child>
						</div>
					</div>
				</Dialog>
			</Transition.Root>
			<div className="relative mx-auto flex max-w-7xl justify-center px-4 pb-16 pt-24 md:px-8 2xl:px-0">
				<div className="w-full border-t border-gray-300 sm:w-1/3 md:w-2/3" />
			</div>

			<div className="relative mx-auto flex max-w-7xl justify-center px-4 pt-4 md:px-8 2xl:px-0">
				<div
					className={
						'flex w-full flex-col gap-4 rounded border border-gray-300 bg-white p-8 sm:w-2/3 lg:w-1/2'
					}
				>
					<div className={'flex w-full flex-col'}>
						<div className={'flex w-full flex-col gap-6'}>
							<h2 className={'text-xl font-bold text-gray-700'}>
								{"Plus d'options"}
							</h2>
							<div className={'flex w-full flex-col gap-4'}>
								<button
									className={'flex items-center justify-start'}
									data-cy="button-logout"
									onClick={() => {
										signOut()
									}}
								>
									<div
										className={
											'flex items-center justify-start gap-3 rounded-lg p-4 hover:bg-gray-100'
										}
									>
										<ArrowRightOnRectangleIcon className={'h-4 w-4'} />
										<span>Me déconnecter</span>
									</div>
								</button>
							</div>
							<div className={'flex w-full flex-col gap-4'}>
								<button
									className={'flex items-center justify-start'}
									data-cy="button-delete-account"
									onClick={() => {
										setOpen(true)
									}}
								>
									<div
										className={
											'flex items-center justify-start gap-3 rounded-lg p-4 hover:bg-gray-100'
										}
									>
										<UserMinusIcon className={'h-4 w-4'} />
										<span>Supprimer mon compte</span>
									</div>
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		</>
	)
}

export default DangerZone
