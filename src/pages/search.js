import Head from 'next/head'
import React, { useEffect, useState } from 'react'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import { useRouter } from 'next/router'
import Image from 'next/image'
import SearchBloc from '@/components/Global/Search/SearchBloc'
import ResponsiveTemporary from '@/components/Global/ResponsiveTemporary'
import CTA from '@/components/Global/CTA'
import FullSearchBloc from '@/components/Global/Search/FullSearchBloc'

function SearchPage() {
	const [searchTerm, setSearchTerm] = useState(undefined)
	const [city, setCity] = useState(undefined)
	const [searchResults, setSearchResults] = useState([])
	const [isSearching, setIsSearching] = useState(false)
	const [lastSearch, setLastSearch] = useState(undefined)
	const [hasSearched, setHasSearched] = useState(false)

	const router = useRouter()

	useEffect(() => {
		const { search, city } = router.query

		if (
			!hasSearched ||
			lastSearch.search !== search ||
			lastSearch.city !== city
		) {
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

		if (city !== '' && city !== undefined) {
			router.push(`/search?search=${searchTerm}&city=${city}`)
			performSearch(searchTerm, city)
		} else {
			router.push(`/search?search=${searchTerm}`)
			performSearch(searchTerm, city)
		}
	}

	async function performSearch(search, city) {
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
		setLastSearch({ search, city })
		setIsSearching(false)
		setHasSearched(true)
	}

	return (
		<>
			<Head>
				<title>Recherche de maquilleuse - My Makeup</title>
				<meta
					name="description"
					content="Recherchez et trouvez votre maquilleuse professionnelle en quelques clics sur My Makeup."
				/>
			</Head>
			<div className={'relative'}>
				<Image
					src={'/assets/coming-soon.svg'}
					alt={'Coming soon'}
					width={'80'}
					height={'80'}
					className={
						'fixed left-0 top-0 z-50 m-4 rounded-full bg-amber-300/75 p-2'
					}
				/>
				<Nav />
				<main className={'relative'}>
					<ResponsiveTemporary />
					<FullSearchBloc />
					{!hasSearched && !isSearching && (
						<div className={'flex w-full items-center justify-center py-32'}>
							<div
								className={'flex flex-col items-center justify-center gap-8'}
							>
								<Image
									src={'/assets/vectorials-used/catSearch.svg'}
									alt={'search'}
									width={300}
									height={300}
								/>
								<h2 className={'text-3xl text-gray-700'}>
									Complétez la recherche pour voir des résultats
								</h2>
							</div>
						</div>
					)}
				</main>
				<Footer />
			</div>
		</>
		// <>
		// 	<Head>
		// 		<title>My Makeup - Search</title>
		// 		<meta
		// 			name="description"
		// 			content="Inscription sur my-makeup.fr la plateforme qui va révolutionner votre
		//             recherche de maquilleuses professionnelles, ou votre recherche de client !"
		// 		/>
		// 	</Head>
		// 	<Nav />
		// 	<main
		// 		className={
		// 			'relative mx-2 mt-36 flex min-h-[55vh] items-center justify-center'
		// 		}
		// 	>
		// 		<SearchBloc />
		//
		// 		{/*## Formulaire plein écran si not hasSearched*/}
		//
		// 		{/*{!hasSearched && !isSearching && (*/}
		// 		{/*	<div className="flex flex-col items-center justify-center">*/}
		// 		{/*		<form autoComplete="off" onSubmit={handleSubmit}>*/}
		// 		{/*			<div className="finder">*/}
		// 		{/*				<div className="finder__outer">*/}
		// 		{/*					<div className="finder__inner">*/}
		// 		{/*						<input*/}
		// 		{/*							className="finder__input"*/}
		// 		{/*							type="text"*/}
		// 		{/*							placeholder="Recherche"*/}
		// 		{/*							value={searchTerm}*/}
		// 		{/*							onChange={e => setSearchTerm(e.target.value)}*/}
		// 		{/*						/>*/}
		// 		{/*					</div>*/}
		// 		{/*				</div>*/}
		// 		{/*			</div>*/}
		//
		// 		{/*			<div className=" flex ">*/}
		// 		{/*				<div className="finder mr-4 mt-8 w-1/2">*/}
		// 		{/*					<div className="finder__outer w-1/2">*/}
		// 		{/*						<div className="finder__inner w-1/2">*/}
		// 		{/*							<input*/}
		// 		{/*								className="finder__input w-1/2"*/}
		// 		{/*								type="text"*/}
		// 		{/*								placeholder="Ville"*/}
		// 		{/*								value={city}*/}
		// 		{/*								onChange={e => setCity(e.target.value)}*/}
		// 		{/*							/>*/}
		// 		{/*						</div>*/}
		// 		{/*					</div>*/}
		// 		{/*				</div>*/}
		//
		// 		{/*				<div className="finder ml-4 mt-8 w-1/2">*/}
		// 		{/*					<div className="finder_submit__outer w-1/2">*/}
		// 		{/*						<div className="finder__inner w-1/2 cursor-pointer">*/}
		// 		{/*							<input*/}
		// 		{/*								className="finder__input w-1/2 cursor-pointer"*/}
		// 		{/*								type="submit"*/}
		// 		{/*								name="q"*/}
		// 		{/*							/>*/}
		// 		{/*						</div>*/}
		// 		{/*					</div>*/}
		// 		{/*				</div>*/}
		// 		{/*			</div>*/}
		// 		{/*		</form>*/}
		// 		{/*	</div>*/}
		// 		{/*)}*/}
		//
		// 		{/*/!*##			Loading animation if isSearching*!/*/}
		// 		{/*<div*/}
		// 		{/*	className={*/}
		// 		{/*		'mx-8 mt-8 grid w-full grid-cols-3 gap-4' +*/}
		// 		{/*		(isSearching ? ' visible' : ' hidden')*/}
		// 		{/*	}*/}
		// 		{/*	// className={'mx-8 mt-8 grid w-full grid-cols-3 gap-4'}*/}
		// 		{/*>*/}
		// 		{/*	<div id="loader">*/}
		// 		{/*		<div id="box"></div>*/}
		// 		{/*		<div id="hill"></div>*/}
		// 		{/*	</div>*/}
		// 		{/*</div>*/}
		//
		// 		{/*## divided screen with cards if hasSearched*/}
		// 		{/*<div*/}
		// 		{/*	className={*/}
		// 		{/*		'm-4 flex h-full w-screen justify-evenly ' +*/}
		// 		{/*		(searchResults.length === 0 || isSearching ? ' hidden' : '')*/}
		// 		{/*	}*/}
		// 		{/*>*/}
		// 		{/*	<div className=" hidden h-auto w-[400px] lg:block">*/}
		// 		{/*		<form autoComplete="off" onSubmit={handleSubmit}>*/}
		// 		{/*			<div className="finder">*/}
		// 		{/*				<div className="finder__outer">*/}
		// 		{/*					<div className="finder__inner">*/}
		// 		{/*						<input*/}
		// 		{/*							className="finder__input"*/}
		// 		{/*							type="text"*/}
		// 		{/*							placeholder="Recherche"*/}
		// 		{/*							value={searchTerm}*/}
		// 		{/*							onChange={e => setSearchTerm(e.target.value)}*/}
		// 		{/*						/>*/}
		// 		{/*					</div>*/}
		// 		{/*				</div>*/}
		// 		{/*			</div>*/}
		// 		{/*			<div className="finder  mt-8">*/}
		// 		{/*				<div className="finder__outer ">*/}
		// 		{/*					<div className="finder__inner ">*/}
		// 		{/*						<input*/}
		// 		{/*							className="finder__input "*/}
		// 		{/*							type="text"*/}
		// 		{/*							placeholder="Ville"*/}
		// 		{/*							value={city}*/}
		// 		{/*							onChange={e => setCity(e.target.value)}*/}
		// 		{/*						/>*/}
		// 		{/*					</div>*/}
		// 		{/*				</div>*/}
		// 		{/*			</div>*/}
		// 		{/*			<div className="finder mt-8  ">*/}
		// 		{/*				<div className="finder_submit__outer ">*/}
		// 		{/*					<div className="finder__inner  cursor-pointer">*/}
		// 		{/*						<input*/}
		// 		{/*							className="finder__input  cursor-pointer"*/}
		// 		{/*							type="submit"*/}
		// 		{/*						/>*/}
		// 		{/*					</div>*/}
		// 		{/*				</div>*/}
		// 		{/*			</div>*/}
		// 		{/*		</form>*/}
		// 		{/*	</div>*/}
		//
		// 		{/*	<div className="m-4 hidden h-auto w-[1px] bg-gray-400 lg:block"></div>*/}
		//
		// 		{/*	<div*/}
		// 		{/*		className={' mt-8 flex w-full grid-cols-3 flex-col gap-4 md:grid'}*/}
		// 		{/*		// className={'grid w-full grid-cols-3 gap-4'}*/}
		// 		{/*	>*/}
		// 		{/*		{searchResults.map(*/}
		// 		{/*			(*/}
		// 		{/*				result // show cards*/}
		// 		{/*			) => (*/}
		// 		{/*				<div*/}
		// 		{/*					key={result.id}*/}
		// 		{/*					className="flex transform cursor-pointer flex-col justify-between rounded border border-gray-200 bg-white p-4 leading-normal shadow transition duration-300 ease-in-out hover:translate-y-1 hover:scale-105 hover:border-gray-400 hover:shadow-lg"*/}
		// 		{/*				>*/}
		// 		{/*					<h3 className="mb-2 font-bold">*/}
		// 		{/*						{result.first_name} {result.last_name}*/}
		// 		{/*					</h3>*/}
		//
		// 		{/*					{result.main_picture != null && (*/}
		// 		{/*						<Image*/}
		// 		{/*							src={result.main_picture.url}*/}
		// 		{/*							alt=""*/}
		// 		{/*							width="100"*/}
		// 		{/*							height="100"*/}
		// 		{/*						/>*/}
		// 		{/*					)}*/}
		//
		// 		{/*					<p>Spécialité : {result.speciality}</p>*/}
		// 		{/*					<p>Ville : {result.city}</p>*/}
		// 		{/*					/!* ... Afficher d'autres informations si vous le souhaitez *!/*/}
		// 		{/*				</div>*/}
		// 		{/*			)*/}
		// 		{/*		)}*/}
		// 		{/*	</div>*/}
		// 		{/*</div>*/}
		// 	</main>
		// 	<Footer />;
		// </>
	)
}

export default SearchPage
