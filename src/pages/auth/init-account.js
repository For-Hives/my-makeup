import React, { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'

import { getSession, useSession } from 'next-auth/react'
import { CheckIcon } from '@heroicons/react/24/outline'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/router'
import Image from 'next/image'
import Head from 'next/head'
import Link from 'next/link'
import * as zod from 'zod'

import FullLoader from '@/components/Global/Loader/FullLoader'
import { patchMeMakeup } from '@/services/PatchMeMakeup'
import Loader from '@/components/Global/Loader/Loader'
import Warning from '@/components/Global/Warning'

const schema = zod
	.object({
		first_name: zod.string({
			required_error: "Ce sera plus facile de t'appeler avec un prénom !",
		}),
		last_name: zod.string({
			required_error: 'Je suis sur que tu as un nom de famille !',
		}),
	})
	.required({
		first_name: true,
		last_name: true,
	})

function InitAccount() {
	const {
		formState: { errors },
		handleSubmit,
		register,
		reset,
	} = useForm({
		resolver: zodResolver(schema),
	})

	const [step, setStep] = useState(0)
	const [stepsList, setStepsList] = useState([
		{ name: "Verification de l'email", status: 'upcoming', href: '#' },
		{ name: 'Initialisation du compte', status: 'upcoming', href: '#' },
		{ name: 'Nom et Prénom', status: 'upcoming', href: '#' },
		{ name: 'Finalisation', status: 'upcoming', href: '#' },
	])
	const [user, setUser] = useState(null)
	const [accountInit, setAccountInit] = useState(false)
	// const [userInterval, setUserInterval] = useState(null)
	const [fistName, setFirstName] = useState('')
	const [lastName, setLastName] = useState('')

	const router = useRouter()

	// get current user id
	const { data: session } = useSession()

	useEffect(() => {
		getUserFromSession(session, user, setUser)
	}, [])

	useEffect(
		id => {
			if (!session) return
			//  get user data

			if (session.user) {
				// if (user === null) {
				// 	setUserInterval(getUserFromSession(session, user, setUser))
				// }
				if (user != null) {
					// see if user is verified
					if (!user.confirmed) {
						// if yes, 1 stepper : verify email
						setStep(1)
					} else {
						// if (userInterval != null) {
						// 	clearInterval(userInterval)
						// }

						if (step <= 3) {
							if (!accountInit) {
								setStep(2)
								// if yes, 2 stepper : init account
								fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me-makeup`, {
									headers: {
										Authorization: `Bearer ${session.jwt}`,
										// 	token
										'Content-Type': 'application/json',
										Accept: 'application/json',
									},
									body: JSON.stringify({}),
									method: 'POST',
								})
									.then(response => {
										if (response.status === 200) {
											// get 200
										}
									})
									.catch(err => {
										toast(
											'Une erreur est survenue, veuillez réessayer plus tard',
											{
												toastId: 'toast-alert',
												type: 'error',
												icon: '⛔',
											}
										)
									})
								setAccountInit(true)
							}
							setStep(3)
						}
					}
				}
			}
		},
		[session, user, step]
	)

	useEffect(() => {
		if (step === 0) {
			setStepsList([
				{
					name: "Vérification de l'email",
					status: 'upcoming',
					href: '#',
				},
				{ name: 'Initialisation du compte', status: 'upcoming', href: '#' },
				{
					name: 'Nom et Prénom',
					status: 'upcoming',
					href: '#',
				},
				{ name: 'Finalisation', status: 'upcoming', href: '#' },
			])
		}
		if (step === 1) {
			setStepsList([
				{
					name: "Vérification de l'email",
					status: 'current',
					href: '#',
				},
				{ name: 'Initialisation du compte', status: 'upcoming', href: '#' },
				{
					name: 'Nom et Prénom',
					status: 'upcoming',
					href: '#',
				},
				{ name: 'Finalisation', status: 'upcoming', href: '#' },
			])
		}
		if (step === 2) {
			setStepsList([
				{
					name: "Vérification de l'email",
					status: 'complete',
					href: '#',
				},
				{ name: 'Initialisation du compte', status: 'current', href: '#' },
				{
					name: 'Nom et Prénom',
					status: 'upcoming',
					href: '#',
				},
				{ name: 'Finalisation', status: 'upcoming', href: '#' },
			])
		}
		if (step === 3) {
			setStepsList([
				{
					name: "Vérification de l'email",
					status: 'complete',
					href: '#',
				},
				{ name: 'Initialisation du compte', status: 'complete', href: '#' },
				{
					name: 'Nom et Prénom',
					status: 'current',
					href: '#',
				},
				{ name: 'Finalisation', status: 'upcoming', href: '#' },
			])
		}
		if (step === 4) {
			setStepsList([
				{
					name: "Vérification de l'email",
					status: 'complete',
					href: '#',
				},
				{ name: 'Initialisation du compte', status: 'complete', href: '#' },
				{
					name: 'Nom et Prénom',
					status: 'complete',
					href: '#',
				},
				{ name: 'Finalisation', status: 'current', href: '#' },
			])
		}
	}, [step])

	function onSubmit(data) {
		patchMeMakeup(session, data)

		setStep(4)
	}

	if (step === 0) return <FullLoader />

	return (
		<>
			<Head>
				<title>My-Makeup</title>
				<meta
					content="Inscription sur my-makeup.fr la plateforme qui va révolutionner votre
	            recherche de maquilleuses professionnelles, ou votre recherche de client !"
					name="description"
				/>
			</Head>
			<div className="relative flex min-h-screen bg-white">
				<div className="container mx-auto flex max-w-7xl flex-col p-4 xl:container">
					<div className="flex h-full flex-col rounded-lg bg-white shadow-xl">
						<div className="p-4">
							{/* Content goes here */}
							{/* We use less vertical padding on card headers on desktop than on body sections */}
							<nav aria-label="Progress">
								<ol
									className="divide-y divide-gray-300 rounded-md border border-gray-300 md:flex md:divide-y-0"
									role="list"
								>
									{stepsList.map((step, stepIdx) => (
										<li className="relative md:flex md:flex-1" key={step.name}>
											{step.status === 'complete' ? (
												<Link
													className="group flex w-full items-center"
													href={step.href}
												>
													<div className="flex items-center gap-4 px-4 py-3 text-sm font-medium md:px-6 md:py-4">
														<span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 group-hover:bg-indigo-800 md:h-10 md:w-10">
															<CheckIcon
																aria-hidden="true"
																className="h-4 w-4 text-white md:h-6 md:w-6"
															/>
														</span>
														<span className="text-sm font-medium text-gray-900">
															{step.name}
														</span>
													</div>
												</Link>
											) : (
												<>
													{step.status === 'current' ? (
														<Link
															aria-current="step"
															className="group flex w-full items-center"
															href={step.href}
														>
															<div className="flex items-center gap-4 px-4 py-3 text-sm font-medium md:px-6 md:py-4">
																<div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 border-indigo-600 md:h-10 md:w-10">
																	<span className="text-indigo-600">
																		{step.id}
																	</span>
																</div>
																<span className="text-sm font-medium text-indigo-600">
																	{step.name}
																</span>
															</div>
														</Link>
													) : (
														<Link
															className="group flex items-center"
															href={step.href}
														>
															<div className="flex items-center gap-4 px-4 py-3 text-sm font-medium md:px-6 md:py-4">
																<span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 border-gray-300 group-hover:border-gray-400 md:h-10 md:w-10">
																	<span className="text-gray-500 group-hover:text-gray-900">
																		{step.id}
																	</span>
																</span>
																<span className="text-sm font-medium text-gray-500 group-hover:text-gray-900">
																	{step.name}
																</span>
															</div>
														</Link>
													)}
												</>
											)}
											{stepIdx !== stepsList.length - 1 ? (
												<>
													{/* Arrow separator for lg screens and up */}
													<div
														aria-hidden="true"
														className="absolute right-0 top-0 hidden h-full w-5 md:block"
													>
														<svg
															className="h-full w-full text-gray-300"
															fill="none"
															preserveAspectRatio="none"
															viewBox="0 0 22 80"
														>
															<path
																d="M0 -2L20 40L0 82"
																stroke="currentcolor"
																strokeLinejoin="round"
																vectorEffect="non-scaling-stroke"
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
						<div className="flex h-full w-full items-center justify-center p-6">
							{/* Content goes here */}
							{step === 1 && (
								<div className="flex h-full w-full flex-col items-center justify-start md:justify-start">
									<div className="relative flex h-full w-full flex-col items-center justify-start gap-4 overflow-hidden md:justify-start">
										<div
											className={
												'absolute right-0 top-1/2 z-10 -rotate-12 transform opacity-50'
											}
										>
											<div
												className={'flex w-full items-center justify-center'}
											>
												<Image
													alt={'email Vérification'}
													className={'opacity-5'}
													height={500}
													src={'/assets/brand/050-email.svg'}
													width={500}
												/>
											</div>
										</div>
										<div>
											<h1 className="text-center text-3xl font-bold">
												Vérification de votre adresse email
											</h1>
										</div>
										<div>
											<p className="text-center">
												Vous avez reçu un lien par email pour vérifier votre
												compte !
											</p>
											<p className="text-center">
												Si vous ne recevez pas de mail, vérifiez dans vos
												courriers indésirables
											</p>
										</div>
									</div>
								</div>
							)}
							{step === 2 && (
								<div className="mt-20 flex h-full w-full flex-col items-center justify-start md:m-0 md:justify-center">
									<div className={'flex flex-col gap-4'}>
										<Loader />
										<p>Initialisation du compte en cours...</p>
									</div>
								</div>
							)}
							{step === 3 && (
								<div className="flex flex-col items-center justify-center">
									<div className="flex flex-col items-center justify-center md:my-8 md:gap-4 xl:gap-8">
										<div>
											<h1 className="text-center text-3xl font-bold">
												Votre nom et votre prénom
											</h1>
											<p className="text-center text-gray-700">
												Ces informations seront visibles par les autres
												utilisateurs
											</p>
										</div>

										<div className="mx-auto w-full sm:max-w-[480px]">
											<div className="rounded-lg bg-white px-6 py-12 shadow-xl sm:px-12">
												<form
													action="#"
													className="space-y-6"
													method="POST"
													onSubmit={handleSubmit(onSubmit)}
												>
													<div>
														<label
															className="block text-sm font-medium leading-6 text-gray-900"
															htmlFor="first_name"
														>
															Prénom
														</label>
														<div className="mt-2">
															<input
																data-cy={'first_name'}
																name="first_name"
																required
																type="text"
																value={fistName}
																{...register('first_name')}
																className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
																onChange={e => {
																	setFirstName(e.target.value)
																}}
															/>
														</div>
													</div>

													<div>
														<label
															className="block text-sm font-medium leading-6 text-gray-900"
															htmlFor="last_name"
														>
															Nom de famille
														</label>
														<div className="mt-2">
															<input
																data-cy={'last_name'}
																id="last_name"
																name="last_name"
																required
																type="text"
																value={lastName}
																{...register('last_name')}
																className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
																onChange={e => {
																	setLastName(e.target.value)
																}}
															/>
														</div>
													</div>

													<div>
														<button
															className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
															data-cy={'submit'}
															type="submit"
														>
															Suivant
														</button>
													</div>
												</form>
											</div>
										</div>
									</div>
								</div>
							)}
							{step === 4 && (
								<div className="flex flex-col items-center justify-center">
									<div className="flex flex-col items-center justify-center gap-4">
										<div>
											<h2 className="text-center text-3xl font-bold">
												Bienvenue sur My&nbsp;Makeup !
											</h2>
											<div
												className={
													'flex h-full w-full flex-col items-center justify-center'
												}
											>
												<h2 className={'text-center text-gray-700'}>
													{' '}
													Rendez-vous sur votre profil pour terminer de le
													compléter{' '}
												</h2>
											</div>
										</div>
										<Warning
											description={
												"Votre profil ne sera pas visible tant qu'il ne sera pas totalement rempli !"
											}
											title={'Attention !'}
										/>
										<Link
											className="rounded-md bg-indigo-600 px-3 py-1.5 text-white"
											data-cy={'profil'}
											href="/auth/profil"
										>
											Mon profil
										</Link>
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</>
	)
}

export default InitAccount

async function getUserFromSession(session, user, setUser) {
	if (!session) return null

	if (user != null && user.confirmed) return null

	const userData = await fetch(
		`${process.env.NEXT_PUBLIC_API_URL}/api/users/me`,
		{
			headers: {
				Authorization: `Bearer ${session.jwt}`,
				// 	token
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			method: 'GET',
		}
	)
	const res = await userData.json()
	setUser(res)
	return res
}

export const getServerSideProps = async ({ req }) => {
	const session = await getSession({ req })
	return {
		props: {
			session,
		},
	}
}
