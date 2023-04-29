import Head from 'next/head'
import React, { useEffect, useState } from 'react'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import { useRouter } from 'next/router'

function SearchPage() {
	const [searchTerm, setSearchTerm] = useState(undefined)
	const [city, setCity] = useState(undefined)
	const [searchResults, setSearchResults] = useState([])
	const [isSearching, setIsSearching] = useState(false)
	const [hasSearched, setHasSearched] = useState(false)

	const router = useRouter()

	// useEffect(() => {
	// 	loadSearchBar();
	// }, []);

	useEffect(() => {
		if (!hasSearched) {
			const { search, city } = router.query
			if (search === undefined && city === undefined) {
				return
			}

			if (search) {
				setSearchTerm(search)
			}
			if (city) {
				setCity(city)
			}
			performSearch(search, city).then(() => {
				setHasSearched(true)
			})
		}
	}, [hasSearched, performSearch, router.query])

	const handleSubmit = e => {
		e.preventDefault()

		if (searchTerm === undefined) {
			return
		}

		if (city !== '') {
			router.push(`/search?search=${searchTerm}&city=${city}`)
			performSearch(searchTerm, city)
		} else {
			router.push(`/search?search=${searchTerm}`)
			performSearch(searchTerm, city)
		}
	}

	async function performSearch(search, city) {
		console.log('performSearch', search, city)

		if (search === undefined || search === '') {
			return
		}

		setIsSearching(true)

		let url = `https://api.my-makeup.fr/api/searching?search=${search}&city=${city}`
		if (city === '' || city === undefined) {
			url = `https://api.my-makeup.fr/api/searching?search=${search}`
		}

		const response = await fetch(url)
		const results = await response.json()

		// delay 5 seconds before setting isSearching to false
		await new Promise(resolve => setTimeout(resolve, 2500))

		setSearchResults(results)
		setIsSearching(false)
		setHasSearched(true)
	}

	function loadSearchBar() {
		const input = document.querySelector('.finder__input')
		const finder = document.querySelector('.finder')
		const form = document.querySelector('form')

		input.addEventListener('focus', () => {
			finder.classList.add('active')
		})

		input.addEventListener('blur', () => {
			if (input.value.length === 0) {
				finder.classList.remove('active')
			}
		})

		form.addEventListener('submit', ev => {
			ev.preventDefault()
			finder.classList.add('processing')
			finder.classList.remove('active')
			input.disabled = true
			setTimeout(() => {
				finder.classList.remove('processing')
				input.disabled = false
				if (input.value.length > 0) {
					finder.classList.add('active')
				}
			}, 1000)
		})
	}

	return (
		<>
			<Head>
				<title>My Makeup - Search</title>
				<meta
					name="description"
					content="Inscription sur my-makeup.fr la plateforme qui va révolutionner votre
                recherche de maquilleuses professionnelles, ou votre recherche de client !"
				/>
			</Head>
			<Nav />
			<main
				className={
					'relative mt-36 flex min-h-[50vh] items-center justify-center'
				}
			>
				{/*/!*## Formulaire plein écran si not hasSearched*!/*/}

				{/*{!hasSearched && !isSearching && (<div className='flex flex-col items-center justify-center'>*/}

				{/*	<form autoComplete='off' onSubmit={handleSubmit}>*/}
				{/*		<div className='finder'>*/}
				{/*			<div className='finder__outer'>*/}
				{/*				<div className='finder__inner'>*/}
				{/*					<div className='finder__icon'></div>*/}
				{/*					<input className='finder__input'*/}
				{/*								 type='text'*/}
				{/*								 placeholder='Recherche'*/}
				{/*								 value={searchTerm}*/}
				{/*								 onChange={e => setSearchTerm(e.target.value)}*/}
				{/*					/>*/}
				{/*				</div>*/}
				{/*			</div>*/}
				{/*		</div>*/}

				{/*		<div className=' flex '>*/}

				{/*			<div className='finder mt-8 w-1/2 mr-4'>*/}
				{/*				<div className='finder__outer w-1/2'>*/}
				{/*					<div className='finder__inner w-1/2'>*/}
				{/*						<input className='finder__input w-1/2'*/}
				{/*									 type='text'*/}
				{/*									 placeholder='Ville'*/}
				{/*									 value={city}*/}
				{/*									 onChange={e => setCity(e.target.value)}*/}
				{/*						/>*/}
				{/*					</div>*/}
				{/*				</div>*/}
				{/*			</div>*/}

				{/*			<div className='finder mt-8 w-1/2 ml-4'>*/}
				{/*				<div className='finder_submit__outer w-1/2'>*/}
				{/*					<div className='finder__inner w-1/2 cursor-pointer'>*/}
				{/*						<input className='finder__input w-1/2 cursor-pointer' type='submit' name='q' />*/}
				{/*					</div>*/}
				{/*				</div>*/}
				{/*			</div>*/}

				{/*		</div>*/}

				{/*	</form>*/}

				{/*</div>)}*/}

				{/*##			Loading animation if isSearching*/}

				{/*<div*/}
				{/*	// className={'mx-8 mt-8 grid w-full grid-cols-3 gap-4' + (isSearching ? ' visible' : ' hidden')}*/}
				{/*	className={'mx-8 mt-8 grid w-full grid-cols-3 gap-4'}*/}
				{/*>*/}
				{/*	<div id='loader'>*/}
				{/*		<div id='box'></div>*/}
				{/*		<div id='hill'></div>*/}
				{/*	</div>*/}
				{/*</div>*/}

				{/*## divided screen with cards if hasSearched*/}

				<div className={'flex h-full w-screen justify-evenly  bg-pink-500'}>
					<div className="mx-auto h-auto w-1/4 bg-amber-300">
						<form autoComplete="off" onSubmit={handleSubmit}>
							<div className="finder">
								<div className="finder__outer">
									<div className="finder__inner">
										<div className="finder__icon"></div>
										<input
											className="finder__input"
											type="text"
											placeholder="Recherche"
											value={searchTerm}
											onChange={e => setSearchTerm(e.target.value)}
										/>
									</div>
								</div>
							</div>
							<div className="finder mr-4 mt-8 w-1/2">
								<div className="finder__outer w-1/2">
									<div className="finder__inner w-1/2">
										<input
											className="finder__input w-1/2"
											type="text"
											placeholder="Ville"
											value={city}
											onChange={e => setCity(e.target.value)}
										/>
									</div>
								</div>
							</div>
						</form>
					</div>
					<div
						// className={'mx-8 mt-8 grid w-full grid-cols-3 gap-4' + (searchResults.length === 0 || isSearching ? ' hidden' : '')}
						className={' mt-8 grid w-full grid-cols-3 gap-4 bg-blue-300'}
					>
						{searchResults.map(
							(
								result // show cards
							) => (
								<div
									key={result.item.id}
									className="flex transform cursor-pointer flex-col justify-between rounded border border-gray-200 bg-white p-4 leading-normal shadow transition duration-300 ease-in-out hover:translate-y-1 hover:scale-105 hover:border-gray-400 hover:shadow-lg"
								>
									<h3 className="mb-2 font-bold">
										{result.item.first_name} {result.item.last_name}
									</h3>
									<p>Spécialité : {result.item.speciality}</p>
									<p>Ville : {result.item.city}</p>
									{/* ... Afficher d'autres informations si vous le souhaitez */}
								</div>
							)
						)}
					</div>
				</div>
			</main>
			<Footer />;
		</>
	)
}

export default SearchPage
