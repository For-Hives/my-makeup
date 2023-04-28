import Head from 'next/head'
import React, { useEffect, useState } from 'react'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import { useRouter } from 'next/router'

function SearchPage() {
	const [searchTerm, setSearchTerm] = useState('')
	const [city, setCity] = useState('')
	const [searchResults, setSearchResults] = useState([])
	const [isSearching, setIsSearching] = useState(false)
	const [hasSearched, setHasSearched] = useState(false)

	const router = useRouter()

	useEffect(() => {
		if (!hasSearched) {
			const { search, city } = router.query
			console.log(search, city)
			if (search) {
				setSearchTerm(search)
			}
			if (city) {
				setCity(city)
			}

			performSearch(search, city)
		}
	}, [hasSearched, performSearch, router.query])

	const handleSubmit = e => {
		e.preventDefault()
		if (searchTerm === '') {
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

		setIsSearching(true)

		let url = `https://api.my-makeup.fr/api/searching?search=${searchTerm}&city=${city}`
		if (city === '') {
			url = `https://api.my-makeup.fr/api/searching?search=${searchTerm}`
		}

		const response = await fetch(url)
		const results = await response.json()

		// delay 5 seconds before setting isSearching to false
		await new Promise(resolve => setTimeout(resolve, 2500))

		setSearchResults(results)
		setIsSearching(false)
		setHasSearched(true)
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
				className={'relative m-36 flex h-[50vh] items-center justify-center'}
			>
				<form onSubmit={handleSubmit} className="w-1/2 max-w-md">
					<div className="mb-4">
						<input
							className="focus:shadow-outline w-full appearance-none rounded bg-white px-3 py-2 leading-tight text-gray-700 focus:outline-none"
							type="text"
							placeholder="Recherche"
							value={searchTerm}
							onChange={e => setSearchTerm(e.target.value)}
						/>
					</div>
					<div className="flex items-center">
						<input
							className="focus:shadow-outline mr-2 w-full appearance-none rounded bg-white px-3 py-2 leading-tight text-gray-700 focus:outline-none"
							type="text"
							placeholder="Ville"
							value={city}
							onChange={e => setCity(e.target.value)}
						/>
						<button
							className="focus:shadow-outline rounded bg-teal-500 px-4 py-2 font-bold text-white hover:bg-teal-700 focus:outline-none"
							type="submit"
						>
							Valider
						</button>
					</div>
				</form>

				<div
					className={
						'mx-8 mt-8 grid w-full grid-cols-3 gap-4' +
						(searchResults.length === 0 || isSearching ? ' hidden' : '')
					}
				>
					{searchResults.map(result => (
						// show cards

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
					))}
				</div>

				<div
					className={
						'mx-8 mt-8 grid w-full grid-cols-3 gap-4' +
						(isSearching ? ' visible' : ' hidden')
					}
				>
					<div id="loader">
						<div id="box"></div>
						<div id="hill"></div>
					</div>
				</div>
			</main>
			{isSearching && <p>Recherche en cours...</p>}

			<Footer />
		</>
	)
}

export default SearchPage
