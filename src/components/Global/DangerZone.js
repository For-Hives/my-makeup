import { useRouter } from 'next/router'
import React from 'react'
import { ArrowRightOnRectangleIcon } from '@heroicons/react/20/solid'
import { signOut } from 'next-auth/react'

function DangerZone() {
	const router = useRouter()
	return (
		<>
			<div className="relative mx-auto flex max-w-7xl justify-center px-4 pb-16 pt-24 md:px-8 2xl:px-0">
				<div className="w-full border-t border-gray-300 sm:w-1/3 md:w-2/3" />
			</div>

			<div className="relative mx-auto flex max-w-7xl justify-center px-4 pt-4 md:px-8 2xl:px-0">
				<div className={'flex w-full flex-col gap-4 rounded border border-gray-300 bg-white p-8 sm:w-2/3 lg:w-1/2'}>
					<div className={'flex w-full flex-col'}>
						<div className={'flex w-full flex-col gap-6'}>
							<h2 className={'text-xl font-bold text-gray-700'}>{"Plus d'options"}</h2>
							<div className={'flex w-full flex-col gap-4'}>
								<button
									data-cy="button-logout"
									className={'flex items-center justify-start'}
									onClick={() => {
										signOut()
									}}
								>
									<div className={'flex items-center justify-start gap-3 rounded-lg p-4 hover:bg-gray-100'}>
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
