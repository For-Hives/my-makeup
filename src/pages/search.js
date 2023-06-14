import Head from 'next/head'
import React, { useEffect, useState } from 'react'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import { useRouter } from 'next/router'
import Image from 'next/image'
import ResponsiveTemporary from '@/components/Global/ResponsiveTemporary'
import FullSearchBloc from '@/components/Global/Search/FullSearchBloc'
import { CatSearch } from '@/components/Global/Search/CatSearch'
import Loader from '@/components/Global/Loader/Loader'
import { BadgeDispo } from '@/components/Profil/Atoms/BadgeDispo'
import { BadgeIndispo } from '@/components/Profil/Atoms/BadgeIndispo'
import { BadgeSuperMaquilleuse } from '@/components/Global/BadgeSuperMaquilleuse'
import { Stars } from '@/components/Profil/Atoms/Stars'
import Link from 'next/link'

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
						<div className={'w-full px-16'}>
							<article className={'grid w-full grid-cols-6 gap-8'}>
								{searchResults.length !== 0 && (
									<>
										{searchResults.map(result => (
											<>
												<Link
													href={`/profil/${result.username}`}
													className={
														'col-span-1 flex w-full flex-col items-center rounded border border-slate-300 bg-white'
													}
												>
													<div className={'relative w-full'}>
														<Image
															src={result.main_picture.url}
															alt={
																'profile picture Maquilleuse professionnelle'
															}
															width={200}
															height={200}
															className={
																'h-[350px] w-full rounded-b-none rounded-t object-cover object-center'
															}
														/>
														<div
															className={
																'absolute left-0 top-0 flex items-center justify-center p-4 opacity-90'
															}
														>
															{result.available ? (
																<>
																	<BadgeDispo />
																</>
															) : (
																<>
																	<BadgeIndispo />
																</>
															)}
														</div>
														<div
															className={
																'absolute bottom-0 left-0 flex flex-col bg-gradient-to-t from-black to-black/0 p-4 pb-8'
															}
														>
															<h3 className="text-2xl font-extrabold text-white">
																{result.first_name} {result.last_name}
															</h3>
															<div>
																<div
																	className={
																		'flex items-center gap-2 text-sm font-semibold text-white'
																	}
																>
																	<span className="material-icons-round text-sm text-white">
																		directions_run
																	</span>
																	peut se déplacer à {result?.city} & dans un
																	rayon de {result?.action_radius}km
																</div>
															</div>
														</div>
														<div className={'absolute -bottom-2.5 left-4'}>
															<BadgeSuperMaquilleuse />
														</div>
													</div>
													<div
														className={'flex w-full flex-col gap-4 p-4 pt-6'}
													>
														<div className={'flex w-full flex-col'}>
															<h2 className="text-lg font-bold text-gray-900">
																{result.speciality}
															</h2>
															<div
																className={'flex flex-row items-center gap-4'}
															>
																<Stars starsToDisplay={result.score} />{' '}
																<span className={'text-sm italic'}>
																	{/* todo connect the score to the number of reviews */}
																	( {result.score.toFixed(0)} avis )
																</span>
															</div>
														</div>
														<div
															className={'flex flex-wrap items-center gap-1'}
														>
															{result?.skills?.length ? (
																<>
																	{result?.skills.map((skill, index) => {
																		return index < 7 ? (
																			<div
																				key={index}
																				className="inline-flex flex-nowrap items-center rounded-full bg-indigo-100 px-3 py-2 text-xs font-medium text-indigo-700"
																			>
																				{skill.name}
																			</div>
																		) : null
																	})}
																</>
															) : (
																<p
																	className={
																		'inline-flex flex-nowrap items-center rounded-full bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700'
																	}
																>
																	Aucune compétence renseignée
																</p>
															)}
														</div>
													</div>
												</Link>
											</>
										))}
									</>
								)}
							</article>
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
