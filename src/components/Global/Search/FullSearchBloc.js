'use client'
import React, { useState } from 'react'

import { MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import { MapPinIcon } from '@heroicons/react/24/outline'
import { useRouter } from 'next/router'

function FullSearchBloc(props) {
	const [searchTerm, setSearchTerm] = useState('')
	const [city, setCity] = useState('')

	const router = useRouter()

	function handleSubmit(e) {
		e.preventDefault()

		if (searchTerm === '') {
			return
		}
		if (city !== '') {
			router.push(
				`/search?search=${encodeURI(searchTerm)}&city=${encodeURI(city)}`
			)
			props.performSearch(searchTerm, city)
		} else {
			router.push(`/search?search=${encodeURI(searchTerm)}`)
			props.performSearch(searchTerm)
		}
	}

	return (
		<div
			className={
				'mb-20 mt-[90px] flex w-full items-center justify-center bg-white px-12 py-8 shadow-2xl lg:border-b lg:border-gray-300'
			}
		>
			<div className={'flex max-w-5xl justify-between'}>
				<form
					className={
						'flex w-full flex-col flex-wrap items-center justify-between gap-6 md:flex-row lg:flex-nowrap'
					}
					onSubmit={handleSubmit}
				>
					<div
						className={
							'flex w-full flex-col flex-wrap gap-6 md:w-auto md:flex-row lg:flex-nowrap'
						}
					>
						<div className={'relative'}>
							<MagnifyingGlassIcon
								aria-hidden="true"
								className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 transform text-indigo-900"
							/>
							<input
								className={
									'flex w-full items-center rounded-lg border-2 border-indigo-900 bg-transparent py-2 pl-12 pr-6 text-sm leading-6 text-indigo-900 lg:w-96'
								}
								data-cy="search-input"
								onChange={e => setSearchTerm(e.target.value)}
								placeholder={
									"Essayez 'Maquilleuse mariée', 'Maquilleuse événements'..."
								}
								value={searchTerm}
							/>
						</div>
						<div className={'relative'}>
							<MapPinIcon
								aria-hidden="true"
								className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 transform text-indigo-900"
							/>
							<input
								className={
									'flex w-full items-center rounded-lg border-2 border-indigo-900 bg-transparent py-2 pl-12 pr-6 text-sm leading-6 text-indigo-900 lg:w-96'
								}
								data-cy="city-input"
								onChange={e => setCity(e.target.value)}
								placeholder={
									'Lieu de la mission (ex: Paris, Lyon, Marseille...)'
								}
								value={city}
							/>
						</div>
					</div>
					<div className={'w-full items-center justify-end md:w-auto'}>
						<button
							className={'btn-primary w-full'}
							data-cy="search-button"
							onSubmit={handleSubmit}
							type="submit"
						>
							Trouver une maquilleuse
						</button>
					</div>
				</form>
			</div>
		</div>
	)
}

export default FullSearchBloc
