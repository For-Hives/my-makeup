import React, { useState } from 'react'
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import { MapPinIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { useRouter } from 'next/router'

function Search() {
	const [searchTerm, setSearchTerm] = useState('')
	const [city, setCity] = useState('')

	const router = useRouter()

	function handleSubmit(e) {
		e.preventDefault()

		if (searchTerm === '') {
			return
		}
		if (city !== '') {
			router.push(`/search?search=${searchTerm}&city=${city}`)
		} else {
			router.push(`/search?search=${searchTerm}`)
		}
	}

	return (
		<div
			className={
				'mb-20 flex w-full max-w-7xl justify-between rounded-2xl bg-white px-12 py-8 shadow-2xl'
			}
		>
			<form onSubmit={handleSubmit} className={' flex items-center gap-6'}>
				<div className={' relative'}>
					<MagnifyingGlassIcon
						className=" top-1/ 2 absolute
			left-4 h-5 w-5 -translate-y-1/2 transform text-indigo-900"
						aria-hidden="true"
					/>

					<input
						className={
							'flex w-80 items-center rounded-lg border-2 border-indigo-900 bg-transparent py-2 pl-12 pr-6 text-sm leading-6 text-indigo-900'
						}
						placeholder={
							"Essayez 'Maquilleuse mariée', 'Maquilleuse événements'..."
						}
						value={searchTerm}
						onChange={e => setSearchTerm(e.target.value)}
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
						value={city}
						onChange={e => setCity(e.target.value)}
					/>
				</div>

				<div className={'mx-8 flex items-center justify-end gap-6'}>
					<button
						type="submit"
						onSubmit={handleSubmit}
						className={'btn-primary'}
					>
						Trouver une maquilleuse
					</button>

					<div className={'flex items-center justify-center'}>ou</div>
					<Link href="/deposer-un-projet" className="">
						<span className={'btn-primary-simple'}>Déposer un projet</span>
					</Link>
				</div>
			</form>
		</div>
	)
}

export default Search
