import React, { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import Image from 'next/image'
import { signIn, signOut, useSession } from 'next-auth/react'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import _ from 'lodash'
import ResponsiveTemporary from '@/components/Global/ResponsiveTemporary'
import { useRouter } from 'next/router'
import { CheckIcon } from '@heroicons/react/24/outline'
import ResumeProfil from '@/components/Profil/Parents/ResumeProfil'
import { useQuery } from '@tanstack/react-query'
import Loader from '@/components/Global/Loader'

function InitAccount() {
	const [step, setStep] = useState(1)
	const [userLoaded, setUserLoaded] = useState(false)

	const router = useRouter()

	// get current user id
	const { data: session } = useSession()

	console.log('session', session)

	useEffect(() => {
		if (!session) return
		//  get user data

		if (session.user) {
			console.log('Sessuion user', session.user)

			// see if user is verified

			if (session.user.emailVerified) {
				// if not, 1 stepper : verify email

				setUserLoaded(true)
			}

			// if yes, 2 stepper : init account
			// if yes, 3 stepper : name + last name
			// if yes, 4 stepper : go to profil page

			const res = fetch(`${process.env.NEXT_PUBLIC_API_URL}api/users/me`, {
				method: 'GET',
				headers: {
					// 	token
					'Content-Type': 'application/json',
					Accept: 'application/json',
					Authorization: `Bearer ${session.jwt}`,
				},
			}).then(res => {
				console.log('res', res)
				setUserLoaded(true)
			})
			return res.json()
		}

		if (userLoaded) {
			fetch(`${process.env.NEXT_PUBLIC_API_URL}api/me-makeup`, {
				method: 'POST',
				headers: {
					// 	token
					'Content-Type': 'application/json',
					Accept: 'application/json',
					Authorization: `Bearer ${session.jwt}`,
				},
				body: JSON.stringify({}),
			})
				.then(response => {
					if (response.status === 200) {
						console.log('response', response.body)
					}
				})
				.catch(err => {
					console.log(err)
				})
			console.log('InitAccount')

			console.log('userLoaded', userLoaded)
		}
	}, [session, userLoaded, step])

	const steps = [
		{ name: 'Step 1', href: '#', status: 'complete' },
		{ name: 'Step 2', href: '#', status: 'complete' },
		{ name: 'Step 3', href: '#', status: 'current' },
		{ name: 'Step 4', href: '#', status: 'upcoming' },
		{ name: 'Step 5', href: '#', status: 'upcoming' },
	]

	if (isLoading) return <Loader />

	if (error) return 'An error has occurred: ' + error.message
	const user = data

	return (
		<>
			<Head>
				<title>My Makeup</title>
				<meta
					name="description"
					content="Inscription sur my-makeup.fr la plateforme qui va révolutionner votre
	            recherche de maquilleuses professionnelles, ou votre recherche de client !"
				/>
			</Head>
			<div className="relative flex min-h-screen bg-white">
				{/*<ResponsiveTemporary />*/}

				<div className="container mx-auto flex flex-col items-center justify-center bg-amber-300 sm:px-6 lg:px-8">
					<div className="overflow-hidden rounded-lg bg-white shadow">
						<div className="px-4 py-5 sm:px-6">
							{/* Content goes here */}
							{/* We use less vertical padding on card headers on desktop than on body sections */}

							<nav aria-label="Progress">
								<ol
									role="list"
									className="divide-y divide-gray-300 rounded-md border border-gray-300 md:flex md:divide-y-0"
								>
									{steps.map((step, stepIdx) => (
										<li key={step.name} className="relative md:flex md:flex-1">
											{step.status === 'complete' ? (
												<a
													href={step.href}
													className="group flex w-full items-center"
												>
													<span className="flex items-center px-6 py-4 text-sm font-medium">
														<span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 group-hover:bg-indigo-800">
															<CheckIcon
																className="h-6 w-6 text-white"
																aria-hidden="true"
															/>
														</span>
														<span className="ml-4 text-sm font-medium text-gray-900">
															{step.name}
														</span>
													</span>
												</a>
											) : step.status === 'current' ? (
												<a
													href={step.href}
													className="flex items-center px-6 py-4 text-sm font-medium"
													aria-current="step"
												>
													<span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 border-indigo-600">
														<span className="text-indigo-600">{step.id}</span>
													</span>
													<span className="ml-4 text-sm font-medium text-indigo-600">
														{step.name}
													</span>
												</a>
											) : (
												<a href={step.href} className="group flex items-center">
													<span className="flex items-center px-6 py-4 text-sm font-medium">
														<span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 border-gray-300 group-hover:border-gray-400">
															<span className="text-gray-500 group-hover:text-gray-900">
																{step.id}
															</span>
														</span>
														<span className="ml-4 text-sm font-medium text-gray-500 group-hover:text-gray-900">
															{step.name}
														</span>
													</span>
												</a>
											)}
											{stepIdx !== steps.length - 1 ? (
												<>
													{/* Arrow separator for lg screens and up */}
													<div
														className="absolute right-0 top-0 hidden h-full w-5 md:block"
														aria-hidden="true"
													>
														<svg
															className="h-full w-full text-gray-300"
															viewBox="0 0 22 80"
															fill="none"
															preserveAspectRatio="none"
														>
															<path
																d="M0 -2L20 40L0 82"
																vectorEffect="non-scaling-stroke"
																stroke="currentcolor"
																strokeLinejoin="round"
															/>
														</svg>
													</div>
												</>
											) : null}
										</li>
									))}
								</ol>
							</nav>
						</div>
						<div className="bg-gray-50 px-4 py-5 sm:p-6">
							{/* Content goes here */}

							<div>
								<ResumeProfil user={user}></ResumeProfil>
							</div>
						</div>
					</div>
				</div>
			</div>
		</>
	)
}

export default InitAccount

// import React, { useEffect } from 'react'
// import Head from 'next/head'
// import Link from 'next/link'
// import Image from 'next/image'
// import { signIn, signOut, useSession } from 'next-auth/react'
// import { useForm, Controller } from 'react-hook-form'
// import { yupResolver } from '@hookform/resolvers/yup'
// import * as yup from 'yup'
// import _ from 'lodash'
// import ResponsiveTemporary from '@/components/Global/ResponsiveTemporary'
// import { useRouter } from 'next/router'
// import { CheckIcon } from '@heroicons/react/24/outline';
//
// function InitAccount() {
// 	console.log('InitAccount')
// 	const { data: session } = useSession()
// 	const router = useRouter()
//
// 	useEffect(() => {
// 		if (!session) return
//
// 		fetch(`${process.env.NEXT_PUBLIC_API_URL}api/me-makeupa`, { // todo : change url to real one
// 			method: 'POST',
// 			headers: {
// 				// 	token
// 				'Content-Type': 'application/json',
// 				Accept: 'application/json',
// 				Authorization: `Bearer ${session.jwt}`,
// 			},
// 			body: JSON.stringify({}),
// 		})
// 			.then(response => {
// 				if (response.status === 200) {
// 					console.log('response', response.body)
// 				}
// 			})
// 			.catch(err => {
// 				console.log(err)
// 			})
// 	}, [session])
//
// 	console.log('user', session?.user)
//
// 	const steps = [
//
//
// 		{ id: '01', name: 'Job details', href: '#', status: 'complete' },
// 		{ id: '02', name: 'Application form', href: '#', status: 'current' },
// 		{ id: '03', name: 'Preview', href: '#', status: 'upcoming' },
// 	]
//
//
// 	return (
// 		<>
// 			<Head>
// 				<title>My Makeup</title>
// 				<meta
// 					name="description"
// 					content="Inscription sur my-makeup.fr la plateforme qui va révolutionner votre
// 	            recherche de maquilleuses professionnelles, ou votre recherche de client !"
// 				/>
// 			</Head>
// 			<div className="relative flex min-h-screen bg-white">
// 				{/*<ResponsiveTemporary />*/}
// 				<div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
// 					<div className="mx-auto w-full max-w-sm lg:w-96">
// 						<div>
// 							<span className="sr-only">My Makeup</span>
// 							<Image
// 								alt="Logo My Makeup"
// 								width={50}
// 								height={50}
// 								src="/assets/logo_2.webp"
// 							/>
// 							<h2 className="mt-6 text-3xl font-bold tracking-tight text-slate-900">
// 								{'Bienvenue sur My Makeup'}
// 							</h2>
// 							<h3>
// 								Rendez-vous sur votre espace personnel pour compléter votre
// 								profil
// 							</h3>
// 						</div>
//
//
// 						<nav aria-label="Progress">
// 							<ol role="list" className="divide-y divide-gray-300 rounded-md border border-gray-300 md:flex md:divide-y-0">
// 								{steps.map((step, stepIdx) => (
// 									<li key={step.name} className="relative md:flex md:flex-1">
// 										{step.status === 'complete' ? (
// 											<a href={step.href} className="group flex w-full items-center">
//                 <span className="flex items-center px-6 py-4 text-sm font-medium">
//                   <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 group-hover:bg-indigo-800">
//                     <CheckIcon className="h-6 w-6 text-white" aria-hidden="true" />
//                   </span>
//                   <span className="ml-4 text-sm font-medium text-gray-900">{step.name}</span>
//                 </span>
// 											</a>
// 										) : step.status === 'current' ? (
// 											<a href={step.href} className="flex items-center px-6 py-4 text-sm font-medium" aria-current="step">
//                 <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 border-indigo-600">
//                   <span className="text-indigo-600">{step.id}</span>
//                 </span>
// 												<span className="ml-4 text-sm font-medium text-indigo-600">{step.name}</span>
// 											</a>
// 										) : (
// 											<a href={step.href} className="group flex items-center">
//                 <span className="flex items-center px-6 py-4 text-sm font-medium">
//                   <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 border-gray-300 group-hover:border-gray-400">
//                     <span className="text-gray-500 group-hover:text-gray-900">{step.id}</span>
//                   </span>
//                   <span className="ml-4 text-sm font-medium text-gray-500 group-hover:text-gray-900">{step.name}</span>
//                 </span>
// 											</a>
// 										)}
//
// 										{stepIdx !== steps.length - 1 ? (
// 											<>
// 												{/* Arrow separator for lg screens and up */}
// 												<div className="absolute right-0 top-0 hidden h-full w-5 md:block" aria-hidden="true">
// 													<svg
// 														className="h-full w-full text-gray-300"
// 														viewBox="0 0 22 80"
// 														fill="none"
// 														preserveAspectRatio="none"
// 													>
// 														<path
// 															d="M0 -2L20 40L0 82"
// 															vectorEffect="non-scaling-stroke"
// 															stroke="currentcolor"
// 															strokeLinejoin="round"
// 														/>
// 													</svg>
// 												</div>
// 											</>
// 										) : null}
// 									</li>
// 								))}
// 							</ol>
// 						</nav>
//
//
//
//
//
//
// 						{!!(session && session.user && !_.isEmpty(session.user)) && (
// 							<div className={'mt-8'}>
// 								<button
// 									type="submit"
// 									className="btn-primary-large"
// 									onClick={() => {
// 										router.push('/auth/profil')
// 									}}
// 								>
// 									Mon Profil
// 								</button>
// 							</div>
// 						)}
// 					</div>
// 				</div>
// 				<div className="relative hidden w-full flex-1 lg:block lg:object-contain">
// 					<div
// 						className={
// 							'absolute left-0 top-0 z-20 h-full w-full bg-gradient-to-r from-white via-transparent to-transparent'
// 						}
// 					></div>
// 					<Image
// 						alt={'background my-makeup'}
// 						fill
// 						src="/assets/bg_makeup.webp"
// 						className={'z-10 -scale-x-100 transform object-cover'}
// 					></Image>
// 				</div>
// 			</div>
// 		</>
// 	)
// }
//
// export default InitAccount
