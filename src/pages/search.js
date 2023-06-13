import Head from 'next/head'
import React, { useEffect, useState } from 'react'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import { useRouter } from 'next/router'
import Image from 'next/image'
import ResponsiveTemporary from '@/components/Global/ResponsiveTemporary'
import FullSearchBloc from '@/components/Global/Search/FullSearchBloc'
import { CatSearch } from '@/components/Global/Search/catSearch'
import Loader from '@/components/Global/Loader/Loader'

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

		setSearchResults(results)
		setLastSearch({ search, city })
		setIsSearching(false)
		setHasSearched(true)

		console.log(results)
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
					<FullSearchBloc performSearch={performSearch} />
					{!hasSearched && !isSearching && (
						<div className={'flex w-full items-center justify-center py-32'}>
							<CatSearch />
						</div>
					)}
					{isSearching && (
						<div className={'flex w-full items-center justify-center py-32'}>
							<Loader />
						</div>
					)}
					{hasSearched && !isSearching && (
						<div className={'flex w-full items-center justify-center py-32'}>
							{searchResults.length === 0 && (
								<div className={'flex flex-col items-center'}>
									{searchResults.map(result => (
										<div
											key={result.id}
											className={'flex flex-col items-center'}
										>
											<h3 className="mb-2 font-bold">
												{result.first_name} {result.last_name}
											</h3>
										</div>
									))}
								</div>
							)}
						</div>
					)}
				</main>
				<Footer />
			</div>
		</>

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
		// 							<h3 className="mb-2 font-bold">
		// 								{result.first_name} {result.last_name}
		// 							</h3>
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
