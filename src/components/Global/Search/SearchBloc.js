import React, { useState } from 'react'
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import { MapPinIcon } from '@heroicons/react/24/outline'
import { useRouter } from 'next/router'

function SearchBloc() {
	const [searchTerm, setSearchTerm] = useState('')
	const [city, setCity] = useState('')

	const router = useRouter()

	function handleSubmit(e) {
		e.preventDefault()

		if (searchTerm === '') {
			return
		}
		if (city !== '') {
			router.push(`/search?search=${encodeURI(searchTerm)}&city=${encodeURI(city)}`)
		} else {
			router.push(`/search?search=${encodeURI(searchTerm)}`)
		}
	}

	return (
		<div className={'mb-4 flex w-full max-w-5xl justify-between rounded-2xl bg-white px-4 py-8 shadow-2xl md:mb-10 lg:mb-20 lg:px-12'}>
			<form onSubmit={handleSubmit} className={'flex w-full flex-col items-center justify-between gap-6 sm:gap-4 md:flex-row md:flex-wrap lg:gap-6'}>
				<div className={'flex w-full flex-col gap-4 px-2 md:w-full md:flex-row lg:w-auto lg:gap-6 lg:px-0'}>
					<div className={'relative w-full md:w-full lg:w-auto'}>
						<MagnifyingGlassIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 transform text-indigo-900" aria-hidden="true" />
						<input
							className={
								'flex w-full items-center rounded-lg border-2 border-indigo-900 bg-transparent py-2 pl-12 pr-6 text-sm leading-6 text-indigo-900 md:w-full lg:w-80'
							}
							placeholder={"Essayez 'Maquilleuse mariée', 'Maquilleuse événements'..."}
							value={searchTerm}
							onChange={e => setSearchTerm(e.target.value)}
						/>
					</div>
					<div className={'relative w-full md:w-full lg:w-auto'}>
						<MapPinIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 transform text-indigo-900" aria-hidden="true" />
						<input
							className={
								'flex w-full items-center rounded-lg border-2 border-indigo-900 bg-transparent py-2 pl-12 pr-6 text-sm leading-6 text-indigo-900 md:w-full lg:w-80'
							}
							placeholder={'Lieu de la mission (ex: Paris, Lyon, Marseille...)'}
							value={city}
							onChange={e => setCity(e.target.value)}
						/>
					</div>
				</div>
				<div className={'flex h-full w-full items-center justify-center px-2 md:h-auto md:w-full md:items-center lg:w-auto'}>
					<button type="submit" onSubmit={handleSubmit} className={'btn-primary w-full'}>
						Trouver une maquilleuse
					</button>
				</div>
			</form>
		</div>
	)
}

export default SearchBloc
