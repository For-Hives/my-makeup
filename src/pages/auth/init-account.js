import React, { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import { useSession } from 'next-auth/react'
import { getServerSession } from 'next-auth/next'
import { useRouter } from 'next/router'
import { CheckIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import * as zod from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { patchMeMakeup } from '@/services/PatchMeMakeup'
import { postMeMakeup } from '@/services/PostMeMakeup'
import { NOM_MAX, NOM_MIN } from '@/lib/sauvegarde-profil'
import { suivreChamp } from '@/components/Profil/Atoms/ModalUpdate/ModalElements'
import FullLoader from '@/components/Global/Loader/FullLoader'
import Image from 'next/image'
import Loader from '@/components/Global/Loader/Loader'
import Warning from '@/components/Global/Warning'
import { onboardingStepName, SOURCES_ORIGINE, track } from '@/lib/analytics'
import {
	API_SERVEUR,
	authOptions,
	journalAuth,
} from '@/pages/api/auth/[...nextauth]'
import { messageErreur } from '@/lib/auth-erreurs'
import {
	aCookieDeSession,
	cookiesSessionAEffacer,
	DELAI_REVALIDATION_MS,
	urlSessionExpiree,
} from '@/lib/auth-session'

const schema = zod
	.object({
		first_name: zod
			.string({
				required_error: "Ce sera plus facile de t'appeler avec un prénom !",
			})
			.trim()
			.min(NOM_MIN, `Ton prénom doit contenir au moins ${NOM_MIN} caractères.`)
			.max(NOM_MAX, `Ton prénom ne doit pas dépasser ${NOM_MAX} caractères.`),
		last_name: zod
			.string({
				required_error: 'Je suis sur que tu as un nom de famille !',
			})
			.trim()
			.min(NOM_MIN, `Ton nom doit contenir au moins ${NOM_MIN} caractères.`)
			.max(NOM_MAX, `Ton nom ne doit pas dépasser ${NOM_MAX} caractères.`),
	})
	.required({
		first_name: true,
		last_name: true,
	})

// « Comment as-tu connu My Makeup ? » (UI-05): one optional answer, kept out
// of the form schema and of the PATCH, only counted by Umami
const LIBELLES_ORIGINE = {
	instagram: 'Instagram',
	google: 'Recherche Google',
	'bouche-a-oreille': 'Bouche-à-oreille',
	ecole: 'École de maquillage',
	autre: 'Autre',
}

function InitAccount({ compte, erreur }) {
	const {
		register,
		handleSubmit,
		formState: { errors },
		reset,
	} = useForm({
		resolver: zodResolver(schema),
	})
	const suivre = suivreChamp(register)

	const [step, setStep] = useState(0)
	const [stepsList, setStepsList] = useState([
		{ name: "Verification de l'email", href: '#', status: 'upcoming' },
		{ name: 'Initialisation du compte', href: '#', status: 'upcoming' },
		{ name: 'Nom et Prénom', href: '#', status: 'upcoming' },
		{ name: 'Finalisation', href: '#', status: 'upcoming' },
	])
	// { confirmed } read on the server: the page no longer waits for a
	// session in its props (removed) to know the account (AUTH-08)
	const [user] = useState(compte)
	// profile creation (POST /api/me-makeup): 'attente' | 'en-cours' | 'ok' | 'erreur'
	const [creation, setCreation] = useState('attente')
	const creationLancee = useRef(false)
	const [fistName, setFirstName] = useState('')
	const [lastName, setLastName] = useState('')
	const [envoi, setEnvoi] = useState(false)
	const [erreurEnvoi, setErreurEnvoi] = useState(null)
	const [origine, setOrigine] = useState(null)
	// the profile existed before this visit (reload, back button, Google
	// sign-in of an artist who has one): not a new sign-up, so no question
	const [profilExistant, setProfilExistant] = useState(false)
	const premiereOrigine = useRef(null)

	const router = useRouter()

	// get current user id
	const { data: session } = useSession()

	// The profile is created once (the session object changes on every
	// refetch, and React runs effects twice in development), and the name
	// step only shows up once the API answered (UI-05): the PATCH of the name
	// can no longer reach the API before the profile exists.
	const creerProfil = async sessionCourante => {
		setCreation('en-cours')
		setStep(2)
		const resultat = await postMeMakeup(sessionCourante)
		if (resultat.ok) {
			setProfilExistant(resultat.existant === true)
			setCreation('ok')
			setStep(3)
			return
		}
		if (resultat.sessionExpiree) return // sent to the sign-in page
		creationLancee.current = false
		setCreation('erreur')
	}

	useEffect(() => {
		if (!session?.user || user == null) return
		// see if user is verified
		if (!user.confirmed) {
			// if yes, 1 stepper : verify email
			setStep(1)
			return
		}
		if (creationLancee.current) return
		creationLancee.current = true
		creerProfil(session)
	}, [session, user])

	// onboarding funnel: each step counted once per visit, `termine` = sign-up done
	const countedSteps = useRef(new Set())
	useEffect(() => {
		const name = onboardingStepName(step)
		if (name === null || countedSteps.current.has(name)) return
		countedSteps.current.add(name)
		track('onboarding_step', { step: name })
	}, [step])

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

	// « Bienvenue » only once the API stored the name
	async function onSubmit(data) {
		setEnvoi(true)
		setErreurEnvoi(null)
		const champs = { first_name: data.first_name, last_name: data.last_name }
		const resultat = await patchMeMakeup(session, champs, 'onboarding')
		setEnvoi(false)
		if (!resultat.ok) {
			setErreurEnvoi(resultat.error ?? null)
			return
		}
		// the answer goes to Umami only, never to the API, and only for a
		// profile created by this visit (one answer per sign-up)
		if (origine && !profilExistant)
			track('onboarding_source', { source: origine })
		setStep(4)
	}

	if (erreur) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white px-4">
				<h1 className="text-center text-2xl font-bold text-gray-700">
					{messageErreur(erreur)}
				</h1>
				<Link href={'/auth/init-account'} className="btn-primary-large w-auto">
					Réessayer
				</Link>
			</div>
		)
	}

	if (step === 0) return <FullLoader />

	return (
		<>
			<Head>
				<title>My-Makeup</title>
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
															className="group flex w-full items-center"
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
							{step === 2 && creation !== 'erreur' && (
								<div className="mt-20 flex h-full w-full flex-col items-center justify-start md:m-0 md:justify-center">
									<div className={'flex flex-col gap-4'} role="status">
										<Loader />
										<p>Initialisation du compte en cours...</p>
									</div>
								</div>
							)}
							{step === 2 && creation === 'erreur' && (
								<div className="flex flex-col items-center justify-center gap-6">
									<p
										role="alert"
										data-cy="init-account-error"
										className="rounded-md bg-red-50 p-3 text-center text-sm text-red-800"
									>
										Ton profil n&apos;a pas pu être créé : le service est
										momentanément indisponible. Réessaie dans quelques minutes.
									</p>
									<button
										type="button"
										data-cy="init-account-retry"
										className="btn-primary"
										onClick={() => {
											creationLancee.current = true
											creerProfil(session)
										}}
									>
										Réessayer
									</button>
								</div>
							)}
							{step === 3 && (
								<div className="flex flex-col items-center justify-center">
									<div className="flex flex-col items-center justify-center md:my-8 md:gap-4 xl:gap-8">
										<div>
											<h1 className="text-center text-3xl font-bold">
												Ton nom et ton prénom
											</h1>
											<p className="text-center text-gray-700">
												Ton prénom et ton nom seront visibles sur ta page.
											</p>
										</div>

										<div className="mx-auto w-full sm:max-w-[480px]">
											<div className="rounded-lg bg-white px-6 py-12 shadow-xl sm:px-12">
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
																data-cy={'first_name'}
																id="first_name"
																type="text"
																required
																value={fistName}
																name="first_name"
																{...register('first_name')}
																onChange={suivre('first_name', e => {
																	setFirstName(e.target.value)
																})}
																className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
															/>
															{errors.first_name && (
																<p
																	data-cy="error-first-name"
																	className={'mt-2 text-xs text-red-500/80'}
																>
																	{errors.first_name.message}
																</p>
															)}
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
																data-cy={'last_name'}
																id="last_name"
																type="text"
																required
																name="last_name"
																value={lastName}
																{...register('last_name')}
																onChange={suivre('last_name', e => {
																	setLastName(e.target.value)
																})}
																className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
															/>
															{errors.last_name && (
																<p
																	data-cy="error-last-name"
																	className={'mt-2 text-xs text-red-500/80'}
																>
																	{errors.last_name.message}
																</p>
															)}
														</div>
													</div>

													{!profilExistant && (
														<fieldset aria-describedby="onboarding-source-aide">
															<legend className="block text-sm font-medium leading-6 text-gray-900">
																Comment as-tu connu My&nbsp;Makeup&nbsp;?{' '}
																<span className="font-normal text-gray-500">
																	(facultatif)
																</span>
															</legend>
															<p
																id="onboarding-source-aide"
																className="mt-1 text-xs text-gray-500"
															>
																Ta réponse sert seulement à nos statistiques :
																elle n&apos;est enregistrée ni dans ton compte
																ni dans ton profil.
															</p>
															<div className="mt-2 space-y-1">
																{SOURCES_ORIGINE.map((valeur, rang) => (
																	<label
																		key={valeur}
																		htmlFor={`onboarding-source-${valeur}`}
																		className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md px-2 text-sm text-gray-900 hover:bg-gray-50"
																	>
																		<input
																			ref={
																				rang === 0 ? premiereOrigine : undefined
																			}
																			id={`onboarding-source-${valeur}`}
																			data-cy={`onboarding-source-${valeur}`}
																			type="radio"
																			name="onboarding_source"
																			value={valeur}
																			checked={origine === valeur}
																			onChange={() => setOrigine(valeur)}
																			className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-600"
																		/>
																		{LIBELLES_ORIGINE[valeur]}
																	</label>
																))}
															</div>
															{/* a tap by mistake goes back to « no answer », not to « Autre » */}
															{origine !== null && (
																<button
																	type="button"
																	data-cy="onboarding-source-effacer"
																	onClick={() => {
																		setOrigine(null)
																		premiereOrigine.current?.focus()
																	}}
																	className="mt-1 min-h-[44px] px-2 text-sm text-indigo-600 underline hover:text-indigo-500"
																>
																	Effacer ma réponse
																</button>
															)}
														</fieldset>
													)}

													{erreurEnvoi && (
														<p
															role="alert"
															data-cy="save-error"
															className="rounded-md bg-red-50 p-3 text-sm text-red-800"
														>
															{erreurEnvoi}
														</p>
													)}
													<div>
														<button
															data-cy={'submit'}
															type="submit"
															disabled={envoi}
															aria-busy={envoi}
															className="flex min-h-[44px] w-full items-center justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-wait disabled:opacity-60"
														>
															{envoi ? 'Enregistrement…' : 'Suivant'}
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
											title={'Attention !'}
											description={
												"Votre profil ne sera pas visible tant qu'il ne sera pas totalement rempli !"
											}
										/>
										<Link
											data-cy={'profil'}
											href="/auth/profil"
											className="rounded-md bg-indigo-600 px-3 py-1.5 text-white"
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

export const getServerSideProps = async ({ req, res, resolvedUrl }) => {
	res.setHeader('Cache-Control', 'private, no-store')

	const session = await getServerSession(req, res, authOptions)
	if (!session?.jwt) {
		const cookies = Object.keys(req.cookies ?? {})
		if (aCookieDeSession(cookies)) {
			// the session read refused the cookie (Strapi JWT expired, or
			// /users/me in 401): sign-in again, never « check your email »
			res.setHeader('Set-Cookie', cookiesSessionAEffacer(cookies))
			return {
				redirect: {
					destination: urlSessionExpiree(
						resolvedUrl ?? '/auth/init-account',
						'jwt_expire'
					),
					permanent: false,
				},
			}
		}
		return {
			redirect: {
				destination: '/auth/signin?callbackUrl=%2Fauth%2Finit-account',
				permanent: false,
			},
		}
	}

	let response
	try {
		response = await fetch(`${API_SERVEUR}/api/users/me`, {
			headers: {
				Accept: 'application/json',
				Authorization: `Bearer ${session.jwt}`,
			},
			signal: AbortSignal.timeout(DELAI_REVALIDATION_MS),
		})
	} catch {
		return { props: { compte: null, erreur: 'service-indisponible' } }
	}

	if (response.status === 401) {
		// no « check your email » screen on a dead session: sign-in again
		journalAuth('session_expiree', { code: 'api_401' })
		res.setHeader(
			'Set-Cookie',
			cookiesSessionAEffacer(Object.keys(req.cookies ?? {}))
		)
		return {
			redirect: {
				destination: '/auth/signin?error=session-expiree',
				permanent: false,
			},
		}
	}

	const compte = response.ok ? await response.json().catch(() => null) : null
	if (!compte) {
		return { props: { compte: null, erreur: 'service-indisponible' } }
	}

	// only what the onboarding needs, and no session (nor JWT) in the props
	return { props: { compte: { confirmed: compte.confirmed === true } } }
}
