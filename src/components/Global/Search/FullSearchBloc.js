import { MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import { MapPinIcon } from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'

/**
 * Search form of the search page (UI-07): prefilled with the search of the
 * URL, a city alone is enough; `onSearch` puts the search in the URL.
 * @param {{search?: string, city?: string, onSearch: (r: {search: string, city: string}) => void}} props
 */
function FullSearchBloc({ search = '', city = '', onSearch }) {
	const [searchTerm, setSearchTerm] = useState(search)
	const [ville, setVille] = useState(city)

	// the URL changed (back button, link): the fields follow it
	useEffect(() => setSearchTerm(search), [search])
	useEffect(() => setVille(city), [city])

	function handleSubmit(e) {
		e.preventDefault()
		if (searchTerm.trim() === '' && ville.trim() === '') return
		onSearch({ search: searchTerm, city: ville })
	}

	return (
		<div
			className={
				'mb-20 mt-[90px] flex w-full items-center justify-center bg-white px-12 py-8 shadow-2xl lg:border-b lg:border-gray-300'
			}
		>
			<div className={'flex max-w-5xl justify-between'}>
				<search className="contents">
					<form
						onSubmit={handleSubmit}
						className={'flex w-full flex-col flex-wrap items-center justify-between gap-6 md:flex-row lg:flex-nowrap'}
					>
						<div className={'flex w-full flex-col flex-wrap gap-6 md:w-auto md:flex-row lg:flex-nowrap'}>
							<div className={'relative'}>
								<label htmlFor="recherche-prestation" className="sr-only">
									Prestation recherchée
								</label>
								<MagnifyingGlassIcon
									className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 transform text-indigo-900"
									aria-hidden="true"
								/>
								<input
									id="recherche-prestation"
									type="search"
									data-cy="search-input"
									className={
										'flex w-full items-center rounded-lg border-2 border-indigo-900 bg-transparent py-2 pl-12 pr-6 text-sm leading-6 text-indigo-900 lg:w-96'
									}
									placeholder={"Essayez 'Maquilleuse mariée', 'Maquilleuse événements'..."}
									value={searchTerm}
									onChange={e => setSearchTerm(e.target.value)}
								/>
							</div>
							<div className={'relative'}>
								<label htmlFor="recherche-ville" className="sr-only">
									Ville de la prestation
								</label>
								<MapPinIcon
									className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 transform text-indigo-900"
									aria-hidden="true"
								/>
								<input
									id="recherche-ville"
									data-cy="city-input"
									autoComplete="address-level2"
									className={
										'flex w-full items-center rounded-lg border-2 border-indigo-900 bg-transparent py-2 pl-12 pr-6 text-sm leading-6 text-indigo-900 lg:w-96'
									}
									placeholder={'Lieu de la mission (ex: Paris, Lyon, Marseille...)'}
									value={ville}
									onChange={e => setVille(e.target.value)}
								/>
							</div>
						</div>
						<div className={'w-full items-center justify-end md:w-auto'}>
							<button data-cy="search-button" type="submit" className={'btn-primary w-full'}>
								Trouver une maquilleuse
							</button>
						</div>
					</form>
				</search>
			</div>
		</div>
	)
}

export default FullSearchBloc
