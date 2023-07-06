import { useRouter } from 'next/router'
import ViewDescriptionProfil from '@/components/Profil/Childs/Views/ViewDescriptionProfil'
import React from 'react'
import { signOut } from 'next-auth/react'
import { ArrowRightOnRectangleIcon } from '@heroicons/react/20/solid'

function DangerZone() {
	return (
		// <>
		// 	<div className="relative mt-8">
		// 		<div className="absolute inset-0 flex items-center" aria-hidden="true">
		// 			<div className="w-full border-t border-gray-300" />
		// 		</div>
		// 		<div className="relative flex justify-center">
		// 			<span className="bg-white px-3 text-base font-semibold leading-6 text-gray-900">
		// 				Zone de danger
		// 			</span>
		// 		</div>
		// 	</div>
		// 	<div className="mx-auto mt-8 max-w-7xl px-4 sm:px-6 lg:px-8">
		// 		<div className="mx-auto max-w-3xl">
		// 			<div className="border-1 overflow-hidden rounded-lg border  border-red-500 bg-white shadow">
		// 				<div className="px-4 py-5 sm:p-6">
		// 					<div className="flex flex-col items-center justify-center">
		// 						<div className="flex flex-col gap-4">
		// 							<div className="flex flex-col gap-2">
		// 								<h2 className="text-xl font-bold text-gray-700">
		// 									Se déconnecter
		// 								</h2>
		// 								<p className="text-gray-600">
		// 									Vous serez déconnecté de votre compte
		// 								</p>
		// 							</div>
		// 							<button
		// 								data-cy="button-logout"
		// 								className="flex items-center justify-center gap-2 rounded-md bg-red-500 px-4 py-2 text-white"
		// 								onClick={() => {
		// 									signOut()
		// 									router.push('/auth/signin')
		// 								}}
		// 							>
		// 								<svg
		// 									xmlns="http://www.w3.org/2000/svg"
		// 									className="h-6 w-6 text-white"
		// 									fill="none"
		// 									viewBox="0 0 24 24"
		// 									stroke="currentColor"
		// 								>
		// 									<path
		// 										strokeLinecap="round"
		// 										strokeLinejoin="round"
		// 										strokeWidth="2"
		// 										d="M6 18L18 6M6 6l12 12"
		// 									/>
		// 								</svg>
		// 								<span>Me déconnecter</span>
		// 							</button>
		// 						</div>
		// 					</div>
		// 				</div>
		// 			</div>
		// 		</div>
		<>
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
									data-cy="button-logout"
									type={'button'}
									className={'flex items-center justify-start'}
									onClick={() => {
										signOut()
										router.push('/auth/signin')
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
						</div>
					</div>
				</div>
			</div>
		</>
	)
}

export default DangerZone
