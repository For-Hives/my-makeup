import React, { useEffect, useState } from 'react'
import Head from 'next/head'
import { getSession, useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { CheckIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import * as zod from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { patchMeMakeup } from '@/services/PatchMeMakeup'
import { toast } from 'react-toastify'
import FullLoader from '@/components/Global/Loader/FullLoader'
import Image from 'next/image'
import Loader from '@/components/Global/Loader/Loader'

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
		register,
		handleSubmit,
		formState: { errors },
		reset,
	} = useForm({
		resolver: zodResolver(schema),
	})

	const [step, setStep] = useState(2)
	const [stepsList, setStepsList] = useState([
		{ name: "Verification de l'email", href: '#', status: 'upcoming' },
		{ name: 'Initialisation du compte', href: '#', status: 'upcoming' },
		{ name: 'Nom et Prénom', href: '#', status: 'upcoming' },
		{ name: 'Finalisation', href: '#', status: 'upcoming' },
	])
	const [user, setUser] = useState(null)
	const [accountInit, setAccountInit] = useState(false)
	const [userInterval, setUserInterval] = useState(null)
	const [fistName, setFirstName] = useState('')
	const [lastName, setLastName] = useState('')

	const router = useRouter()

	// get current user id
	const { data: session } = useSession()

	useEffect(
		id => {
			if (!session) return
			//  get user data

			if (session.user) {
				if (user === null) {
					setUserInterval(getUserFromSession(session, user, setUser))
				}
				if (user != null) {
					// see if user is verified
					// todo delete
					if (true || !user.confirmed) {
						// if yes, 1 stepper : verify email
						setStep(1)
					} else {
						if (userInterval != null) {
							clearInterval(userInterval)
						}

						if (step <= 3) {
							if (!accountInit) {
								setStep(2)
								// if yes, 2 stepper : init account
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
											// get 200
										}
									})
									.catch(err => {
										toast(
											'Une erreur est survenue, veuillez réessayer plus tard',
											{
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
					href: '#',
					status: 'upcoming',
				},
				{ name: 'Initialisation du compte', href: '#', status: 'upcoming' },
				{
					name: 'Nom et Prénom',
					href: '#',
					status: 'upcoming',
				},
				{ name: 'Finalisation', href: '#', status: 'upcoming' },
			])
		}
		if (step === 1) {
			setStepsList([
				{
					name: "Vérification de l'email",
					href: '#',
					status: 'current',
				},
				{ name: 'Initialisation du compte', href: '#', status: 'upcoming' },
				{
					name: 'Nom et Prénom',
					href: '#',
					status: 'upcoming',
				},
				{ name: 'Finalisation', href: '#', status: 'upcoming' },
			])
		}
		if (step === 2) {
			setStepsList([
				{
					name: "Vérification de l'email",
					href: '#',
					status: 'complete',
				},
				{ name: 'Initialisation du compte', href: '#', status: 'current' },
				{
					name: 'Nom et Prénom',
					href: '#',
					status: 'upcoming',
				},
				{ name: 'Finalisation', href: '#', status: 'upcoming' },
			])
		}
		if (step === 3) {
			setStepsList([
				{
					name: "Vérification de l'email",
					href: '#',
					status: 'complete',
				},
				{ name: 'Initialisation du compte', href: '#', status: 'complete' },
				{
					name: 'Nom et Prénom',
					href: '#',
					status: 'current',
				},
				{ name: 'Finalisation', href: '#', status: 'upcoming' },
			])
		}
		if (step === 4) {
			setStepsList([
				{
					name: "Vérification de l'email",
					href: '#',
					status: 'complete',
				},
				{ name: 'Initialisation du compte', href: '#', status: 'complete' },
				{
					name: 'Nom et Prénom',
					href: '#',
					status: 'complete',
				},
				{ name: 'Finalisation', href: '#', status: 'current' },
			])
		}
	}, [step])

	function onSubmit(data) {
		// patchMeMakeup(session, data)

		setStep(4)
	}

	// if (step === 0) return <FullLoader />

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
				<div className="container mx-auto flex max-w-7xl flex-col p-4 xl:container">
					<div className="flex h-full flex-col rounded-lg bg-white shadow-xl">
						<div className="p-4">
							{/* Content goes here */}
							{/* We use less vertical padding on card headers on desktop than on body sections */}
							<nav aria-label="Progress">
								<ol
									role="list"
									className="divide-y divide-gray-300 rounded-md border border-gray-300 md:flex md:divide-y-0"
								>
									{stepsList.map((step, stepIdx) => (
										<li key={step.name} className="relative md:flex md:flex-1">
											{step.status === 'complete' ? (
												<Link
													href={step.href}
													className="group flex w-full items-center"
												>
													<div className="flex items-center gap-4 px-4 py-3 text-sm font-medium md:px-6 md:py-4">
														<span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 group-hover:bg-indigo-800 md:h-10 md:w-10">
															<CheckIcon
																className="h-4 w-4 text-white md:h-6 md:w-6"
																aria-hidden="true"
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
															href={step.href}
															className="flex items-center px-2 py-2 text-sm font-medium md:py-4 md:pl-2 md:pr-6"
															aria-current="step"
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
															href={step.href}
															className="group flex items-center"
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
													src={'/assets/brand/050-email.svg'}
													width={500}
													height={500}
													alt={'email Vérification'}
													className={'opacity-5'}
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
								<div className="flex h-full w-full flex-col items-center justify-start md:justify-center">
									<Loader />
								</div>
							)}
							{step === 3 && (
								// todo stop here 21/06/2023
								<div className="flex flex-col items-center justify-center">
									<div className="my-8 flex flex-col items-center justify-center">
										<h1 className="text-center text-3xl font-bold">
											Votre nom et votre prénom
										</h1>
										<p className="text-center">
											Ces informations seront visible par les autres
											utilisateurs
										</p>

										<div className="mt-10 sm:mx-auto sm:w-full sm:max-w-[480px]">
											<div className="bg-white px-6 py-12 shadow sm:rounded-lg sm:px-12">
												<form
													className="space-y-6"
													action="#"
													method="POST"
													onSubmit={handleSubmit(onSubmit)}
												>
													<div>
														<label
															htmlFor="first_name"
															className="block text-sm font-medium leading-6 text-gray-900"
														>
															Prénom
														</label>
														<div className="mt-2">
															<input
																type="text"
																required
																value={fistName}
																name="first_name"
																{...register('first_name')}
																onChange={e => {
																	setFirstName(e.target.value)
																}}
																className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
															/>
														</div>
													</div>

													<div>
														<label
															htmlFor="last_name"
															className="block text-sm font-medium leading-6 text-gray-900"
														>
															Nom de famille
														</label>
														<div className="mt-2">
															<input
																id="last_name"
																type="text"
																required
																name="last_name"
																value={lastName}
																{...register('last_name')}
																onChange={e => {
																	setLastName(e.target.value)
																}}
																className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
															/>
														</div>
													</div>

													<div>
														<button
															type="submit"
															className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
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
									<div className="my-16 flex flex-col items-center justify-center">
										<h1 className="text-center text-3xl font-bold">
											Bienvenue sur My-Makeup !
										</h1>
										<h2>
											{' '}
											Rendez-vous sur votre profile pour terminer de le
											completer{' '}
										</h2>
										<Link
											href="/auth/profil"
											className="my-16 rounded-md bg-indigo-600 px-3 py-1.5 text-white"
										>
											Mon profile
										</Link>
									</div>
								</div>
							)}

							<div>{/*<ResumeProfil user={user}></ResumeProfil>*/}</div>
						</div>
					</div>
				</div>
			</div>
		</>
	)
}

export default InitAccount

function getUserFromSession(session, user, setUser) {
	// call api every 3 seconds
	return setInterval(async () => {
		if (!session) return null

		if (user != null && user.confirmed) return null

		const userData = await fetch(
			`${process.env.NEXT_PUBLIC_API_URL}api/users/me`,
			{
				method: 'GET',
				headers: {
					// 	token
					'Content-Type': 'application/json',
					Accept: 'application/json',
					Authorization: `Bearer ${session.jwt}`,
				},
			}
		)

		setUser(await userData.json())
	}, 4000)
}

export const getServerSideProps = async ({ req }) => {
	const session = await getSession({ req })
	return {
		props: {
			session,
		},
	}
}
