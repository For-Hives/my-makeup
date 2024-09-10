'use client'

import { CheckCircleIcon } from '@heroicons/react/24/outline'
import Image from 'next/image'
import Link from 'next/link'

import { BadgeSuperMaquilleuse } from '@/components/Global/BadgeSuperMaquilleuse'

import { CatSearch } from './CatSearch'
import Loader from '../Loader/Loader'

const MakeupArtistCatalog = ({ MakeupArtistList, status }) => {
	return (
		<>
			{status === 'idle' && (
				<div
					className={
						'flex w-full items-center justify-center py-8 md:py-16 2xl:py-32'
					}
				>
					<CatSearch />
				</div>
			)}

			{status === 'pending' && (
				<div className={'flex w-full items-center justify-center py-32'}>
					<Loader />
				</div>
			)}

			{status === 'resolved' && (
				<div className={'w-full px-4 md:px-16'}>
					<article
						className={
							'grid w-full grid-cols-1 gap-8 md:grid-cols-3 2xl:grid-cols-6'
						}
					>
						{MakeupArtistList.length > 0 && (
							<>
								{MakeupArtistList.map((result, index) => (
									<Link
										className={
											'col-span-1 flex w-full flex-col items-center rounded border border-gray-300 bg-white'
										}
										data-cy={`search-result`}
										href={`/profil/${result.username}`}
										key={index}
									>
										<div className={'relative w-full'}>
											{result.main_picture === null && (
												<Image
													alt={'profil picture Maquilleuse professionnelle'}
													className={
														'h-[350px] w-full rounded-b-none rounded-t object-cover object-center'
													}
													height={250}
													quality={100}
													src={'/assets/pp_makeup.webp'}
													width={250}
												/>
											)}
											{result.main_picture != null && (
												<Image
													alt={'profil picture Maquilleuse professionnelle'}
													className={
														'h-[350px] w-full rounded-b-none rounded-t object-cover object-center'
													}
													height={250}
													src={result.main_picture.url}
													width={250}
												/>
											)}
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
														<span className={'ml-2 translate-y-0.5 transform'}>
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
										</div>
										<div className={'flex w-full flex-col gap-4 p-4 pt-6'}>
											<div className={'flex w-full flex-col'}>
												<h2 className="text-lg font-bold text-gray-900">
													{result.speciality}
												</h2>
											</div>
											<div className={'flex flex-wrap items-center gap-1'}>
												{result?.skills?.length !== 0 ? (
													<>
														{result?.skills.map((skill, index) => {
															return index < 7 ? (
																<div
																	className="inline-flex flex-nowrap items-center rounded-full bg-indigo-100 px-3 py-2 text-xs font-medium text-indigo-700"
																	key={index}
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
		</>
	)
}

export default MakeupArtistCatalog
