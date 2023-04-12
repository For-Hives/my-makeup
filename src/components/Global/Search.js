import React from 'react'
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import { MapPinIcon } from '@heroicons/react/24/outline'

function Search() {
	return (
		<div
			className={
				'mb-20 flex w-full max-w-7xl justify-between rounded-2xl bg-white px-12 py-8 shadow-2xl'
			}
		>
			<div className={'flex items-center gap-6'}>
				<div className={'relative'}>
					<MagnifyingGlassIcon
						className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 transform text-indigo-900"
						aria-hidden="true"
					/>
					<input
						className={
							'flex w-80 items-center rounded-lg border-2 border-indigo-900 bg-transparent py-2 pl-12 pr-6 text-sm leading-6 text-indigo-900'
						}
						placeholder={
							"Essayez 'Maquilleuse mariée', 'Maquilleuse événements'..."
						}
					/>
				</div>
				<div className={'relative'}>
					<MapPinIcon
						className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 transform text-indigo-900"
						aria-hidden="true"
					/>
					<input
						className={
							'flex w-80 items-center rounded-lg border-2 border-indigo-900 bg-transparent py-2 pl-12 pr-6 text-sm leading-6 text-indigo-900'
						}
						placeholder={'Lieu de la mission (ex: Paris, Lyon, Marseille...)'}
					/>
				</div>
			</div>
			<div className={'flex items-center justify-end gap-6'}>
				<a href="/recrutement" className={'btn-primary'}>
					Trouver une maquilleuse
				</a>
				<div className={'flex items-center justify-center'}>ou</div>
				<a href="/deposer-un-projet" className="">
					<span className={'btn-primary-simple'}>Déposer un projet</span>
				</a>
			</div>
		</div>
	)
}

export default Search
