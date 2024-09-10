'use client'

import { MagnifyingGlassIcon, MapPinIcon } from '@heroicons/react/24/outline'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const SearchForm = ({ onSubmit }) => {
	const searchParams = useSearchParams()
	const pathname = usePathname()
	const { replace } = useRouter()

	function handleSearch(name, term) {
		const params = new URLSearchParams(searchParams)
		if (term) {
			params.set(name, term)
		} else {
			params.delete(name)
		}
		replace(`${pathname}?${params.toString()}`)
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
					onSubmit={onSubmit}
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
								defaultValue={searchParams.get('search')?.toString()}
								onChange={e => handleSearch('search', e.target.value)}
								placeholder={
									"Essayez 'Maquilleuse mariée', 'Maquilleuse événements'..."
								}
								required
								type="text"
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
								defaultValue={searchParams.get('city')?.toString()}
								onChange={e => handleSearch('city', e.target.value)}
								placeholder={
									'Lieu de la mission (ex: Paris, Lyon, Marseille...)'
								}
								type="text"
							/>
						</div>
					</div>
					<div className={'w-full items-center justify-end md:w-auto'}>
						<button
							className={'btn-primary w-full'}
							data-cy="search-button"
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

export default SearchForm
