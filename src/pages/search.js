import Head from 'next/head'
import React, { useEffect, useState } from 'react'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import { useRouter } from 'next/router'
import Image from 'next/image'
import FullSearchBloc from '@/components/Global/Search/FullSearchBloc'
import { CatSearch } from '@/components/Global/Search/CatSearch'
import Loader from '@/components/Global/Loader/Loader'
import { BadgeSuperMaquilleuse } from '@/components/Global/BadgeSuperMaquilleuse'
import Link from 'next/link'
import { CheckCircleIcon } from '@heroicons/react/24/outline'

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

		let url = `${process.env.NEXT_PUBLIC_API_URL}/api/searching?search=${search}&city=${city}`
		if (city === '' || city === undefined) {
			url = `${process.env.NEXT_PUBLIC_API_URL}/api/searching?search=${search}`
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
				<title>Recherche de maquilleuse - My-Makeup</title>
				<meta
					name="description"
					content="Recherchez la maquilleuse professionnelle qui vous correspond en quelques clics sur My-Makeup."
				/>
				{/*	seo tag canonical link */}
				<link rel="canonical" href={'https://my-makeup.fr/search'} />
			</Head>
			<div className={'relative'}>
				<Nav isFindMakeupArtistBtnVisible={false} />
				<main className={'relative'}>
					<FullSearchBloc performSearch={performSearch} />
					{!hasSearched && !isSearching && (
						<div
							className={
								'flex w-full items-center justify-center py-8 md:py-16 2xl:py-32'
							}
						>
							<CatSearch />
						</div>
					)}
					{isSearching && (
						<div className={'flex w-full items-center justify-center py-32'}>
							<Loader />
						</div>
					)}
					{hasSearched && !isSearching && (
						<div className={'w-full px-4 md:px-16'}>
							<article
								className={
									'grid w-full grid-cols-1 gap-8 md:grid-cols-3 2xl:grid-cols-6'
								}
							>
								{searchResults.length !== 0 && (
									<>
										{searchResults.map((result, index) => (
											<Link
												key={index}
												href={`/profil/${result.username}`}
												data-cy={`search-result`}
												className={
													'col-span-1 flex w-full flex-col items-center rounded border border-gray-300 bg-white'
												}
											>
												<div className={'relative w-full'}>
													<Image
														src={result.main_picture.url}
														alt={'profil picture Maquilleuse professionnelle'}
														width={200}
														height={200}
														className={
															'h-[350px] w-full rounded-b-none rounded-t object-cover object-center'
														}
													/>
													{result?.pro === true && (
														<div
															className={
																'absolute left-0 top-0 flex items-center justify-center pt-4'
															}
														>
															<BadgeSuperMaquilleuse />
														</div>
													)}
													<div
														className={
															'absolute bottom-0 left-0 flex w-full flex-col bg-gradient-to-t from-black to-black/0 p-4'
														}
													>
														<div className={'flex flex-row items-baseline'}>
															<div className={'flex'}>
																<h3 className="text-2xl font-extrabold text-white">
																	{result.first_name} {result.last_name}{' '}
																</h3>
															</div>
															{result?.pro === true && (
																<span
																	className={'ml-2 translate-y-0.5 transform'}
																>
																	<CheckCircleIcon className="h-5 w-5 text-white" />
																</span>
															)}
														</div>
														<div>
															<div
																className={
																	'flex flex-row items-center gap-2 text-sm font-light text-white'
																}
															>
																<span className="material-icons-round text-sm text-white">
																	directions_run
																</span>
																<span>
																	À{' '}
																	<span className={'font-bold'}>
																		{result?.city}
																	</span>{' '}
																	&{' '}
																	<span className={'font-bold'}>
																		{result?.action_radius}
																		km&nbsp;
																	</span>
																	autour
																</span>
															</div>
														</div>
													</div>
													{/*<div className={'absolute -bottom-2.5 left-4'}>*/}
													{/*</div>*/}
												</div>
												<div className={'flex w-full flex-col gap-4 p-4 pt-6'}>
													<div className={'flex w-full flex-col'}>
														<h2 className="text-lg font-bold text-gray-900">
															{result.speciality}
														</h2>
														{/* v2 v3 v4 v5 v6 v7 v8 vjsais pas */}
														{/*{result?.score &&*/}
														{/*	(result?.score === 0 ||*/}
														{/*		result?.score !== null) && (*/}
														{/*		<div*/}
														{/*			className={'flex flex-row items-center gap-4'}*/}
														{/*		>*/}
														{/*			<div*/}
														{/*				className={*/}
														{/*					result?.score &&*/}
														{/*					(result?.score === 0 ||*/}
														{/*						result?.score !== null)*/}
														{/*						? 'opacity-100'*/}
														{/*						: 'opacity-25'*/}
														{/*				}*/}
														{/*			>*/}
														{/*				<Stars starsToDisplay={result?.score} />{' '}*/}
														{/*			</div>*/}
														{/*			/!*<span className={'text-sm italic'}>*!/*/}
														{/*			/!*	{result?.score &&*!/*/}
														{/*			/!*	(result?.score === 0 ||*!/*/}
														{/*			/!*		result?.score !== null) ? (*!/*/}
														{/*			/!*		<>( {result?.score.toFixed(0)} avis )</>*!/*/}
														{/*			/!*	) : (*!/*/}
														{/*			/!*		<></>*!/*/}
														{/*			/!*	)}*!/*/}
														{/*			/!*</span>*!/*/}
														{/*		</div>*/}
														{/*	)}*/}
													</div>
													<div className={'flex flex-wrap items-center gap-1'}>
														{result?.skills?.length !== 0 ? (
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
	)
}

export default SearchPage
