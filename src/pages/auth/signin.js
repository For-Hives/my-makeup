import React, { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { signIn, signOut, useSession } from 'next-auth/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as zod from 'zod'
import _ from 'lodash'
import { messageErreur, normaliserCodeErreur } from '@/lib/auth-erreurs'
import { callbackUrlSure } from '@/lib/auth-session'
import { track } from '@/lib/analytics'

// No password rule at sign-in: older accounts have passwords the sign-up
// rule would refuse (AUTH-11). Strapi decides.
const schema = zod
	.object({
		email: zod
			.string({ required_error: 'Email est requis' })
			.trim()
			.email('Email invalide'),
		password: zod
			.string({ required_error: 'Mot de passe est requis' })
			.min(1, 'Mot de passe est requis'),
	})
	.required({ email: true, password: true })

function Signin() {
	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm({
		resolver: zodResolver(schema),
	})

	const { data: session } = useSession()
	const router = useRouter()
	// ?error=session-expiree, or a code forwarded by /auth/error
	const erreurUrl = router.isReady
		? normaliserCodeErreur(router.query.error)
		: null
	const [erreur, setErreur] = useState(null)
	const [envoi, setEnvoi] = useState(false)

	// page to come back to after signing in: this site only (A3)
	const destination = () =>
		callbackUrlSure(router.query.callbackUrl, window.location.origin)

	const expirationComptee = useRef(false)
	useEffect(() => {
		if (erreurUrl !== 'session-expiree' || expirationComptee.current) return
		expirationComptee.current = true
		track('session_expired', { where: 'api_401' })
	}, [erreurUrl])

	const onSubmit = async data => {
		setEnvoi(true)
		setErreur(null)
		const resultat = await signIn('credentials', {
			email: data.email,
			password: data.password,
			redirect: false,
		})
		const code =
			resultat?.ok && !resultat.error
				? null
				: (normaliserCodeErreur(resultat?.error) ?? 'erreur-inconnue')
		track('login_result', {
			method: 'email',
			ok: code === null,
			code: code ?? 'ok',
		})
		if (code !== null) {
			// message under the form, the URL does not change
			setErreur(code)
			setEnvoi(false)
			return
		}
		router.push(destination())
	}

	return (
		<>
			<Head>
				<title>Connexion sur My-Makeup</title>
				<meta
					name="description"
					content="Connexion sur my-makeup.fr la plateforme qui va révolutionner votre
	            recherche de maquilleuses professionnelles, ou votre recherche de client !"
				/>
				{/* No web font here: the Google button label uses Roboto when the
				    device has it, so no visitor IP is sent to Google Fonts. */}
				{/*	seo tag canonical link */}
				<link rel="canonical" href="https://my-makeup.fr/auth/signin" />
			</Head>
			<div className="relative flex h-[95vh] max-h-screen overflow-hidden md:h-screen md:overflow-auto md:bg-white">
				<div className="flex flex-1 flex-col justify-center bg-white px-4 sm:px-6 md:py-12 md:pt-12 lg:flex-none lg:px-20 xl:px-24">
					<div className="mx-auto w-full max-w-sm lg:w-96">
						<div>
							<Link href={'/'}>
								<span className="sr-only">My-Makeup</span>
								<Image
									alt="Logo My-Makeup"
									width={50}
									height={50}
									src="/assets/logo.webp"
								/>
							</Link>
							<h2 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">
								{session && session.user && !_.isEmpty(session.user)
									? 'Bonjour ' +
										(session.user.name ? session.user.name : session.user.email)
									: 'Se connecter'}
							</h2>
							{erreurUrl && !erreur && (
								<p
									role="alert"
									data-cy="signin-url-error"
									className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900"
								>
									{messageErreur(erreurUrl)}
								</p>
							)}
						</div>
						{!(session && session.user && !_.isEmpty(session.user)) && (
							<div className="mt-8">
								<div>
									<div>
										<h1 className="text-sm font-medium leading-6 text-gray-900">
											Se connecter sur My-Makeup
										</h1>
										<div className="mt-4 grid grid-cols-1 gap-4">
											<div className={'flex w-full justify-center'}>
												<button
													data-cy="google-signin"
													onClick={() => {
														signIn('google', {
															callbackUrl: destination(),
														})
													}}
													className="flex h-[40px] w-full flex-nowrap items-center justify-center gap-[24px] rounded-md bg-white px-3 text-gray-500 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:outline-offset-0"
												>
													<span className="sr-only">
														Se connecter via Google
													</span>
													<Image
														src={'/assets/signin-assets/google_logo.svg'}
														alt={'google logo'}
														width={18}
														height={18}
														className={'h-[18px] w-[18px]'}
													/>
													<p
														className={
															'flex flex-nowrap font-[family-name:Roboto,ui-sans-serif,system-ui,sans-serif] text-[14px] font-medium text-black/[54%]'
														}
													>
														Se connecter avec Google
													</p>
												</button>
											</div>
										</div>
									</div>
									<div className="relative mt-6">
										<div
											className="absolute inset-0 flex items-center"
											aria-hidden="true"
										>
											<div className="w-full border-t border-gray-300" />
										</div>
										<div className="relative flex justify-center text-sm">
											<span className="bg-white px-2 text-gray-500">Ou</span>
										</div>
									</div>
								</div>

								<div className="mt-6">
									<form
										onSubmit={handleSubmit(onSubmit)}
										method="POST"
										className="space-y-6"
									>
										<div>
											<label
												htmlFor="email"
												className="block text-sm font-medium leading-6 text-gray-900"
											>
												Adresse email
											</label>
											<div className="mt-2">
												<input
													data-cy="email-input"
													id="email"
													name="email"
													type="text"
													inputMode="email"
													autoComplete="email"
													{...register('email', {
														required: true,
													})}
													required
													className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
												/>
												{errors.email && (
													<p className={'mt-2 text-xs text-red-500/80'}>
														{errors.email.message}
													</p>
												)}
											</div>
										</div>

										<div className="space-y-1">
											<label
												htmlFor="password"
												className="block text-sm font-medium leading-6 text-gray-900"
											>
												Mot de passe
											</label>
											<div className="mt-2">
												<input
													data-cy="password-input"
													id="password"
													name="password"
													type="password"
													autoComplete="current-password"
													{...register('password', {
														required: true,
													})}
													required
													className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
												/>
												{errors.password && (
													<p className={'mt-2 text-xs text-red-500/80'}>
														{errors.password.message}
													</p>
												)}
											</div>
										</div>

										<div className="flex items-center justify-end">
											<p className={'text-xs'}>
												En entrant sur My-Makeup vous confirmez que vous
												acceptez les{' '}
												<Link
													href={'/cgu'}
													className={'text-indigo-700 underline'}
													target={'_blank'}
												>
													conditions générales.
												</Link>
											</p>
										</div>
										<div className="flex items-center justify-end">
											<div className="text-sm">
												{/* todo */}
												<a
													href="#"
													className="font-medium text-indigo-700 hover:text-indigo-500"
												>
													Mot de passe oublié ?
												</a>
											</div>
										</div>

										{erreur && (
											<p
												role="alert"
												data-cy="signin-error"
												className="rounded-md bg-red-50 p-3 text-sm text-red-800"
											>
												{messageErreur(erreur)}
											</p>
										)}
										<div>
											<button
												data-cy="email-signin"
												type="submit"
												disabled={envoi}
												aria-busy={envoi}
												className="btn-primary-large disabled:cursor-wait disabled:opacity-60"
											>
												{envoi ? 'Connexion…' : 'Se connecter'}
											</button>
										</div>
										<div className={'flex items-center justify-center'}>
											Pas de compte ?&nbsp;
											<Link
												className={
													'font-semibold text-indigo-700 hover:text-indigo-700 hover:underline'
												}
												href={'/auth/signup'}
											>
												Inscris-toi
											</Link>
										</div>
									</form>
								</div>
							</div>
						)}
						{!!(session && session.user && !_.isEmpty(session.user)) && (
							<div className={'mt-8'}>
								<h2 className={'my-8 text-2xl font-semibold text-gray-900'}>
									Vous êtes déjà connecté
								</h2>

								<Link
									type="submit"
									className="btn-alt-primary mt-8"
									href={'/auth/profil'}
								>
									Retourner sur mon profil
								</Link>

								<button
									type="submit"
									className="btn-primary-large mt-8"
									onClick={() => {
										signOut()
									}}
								>
									Se déconnecter
								</button>
							</div>
						)}
					</div>
				</div>
				<div className="relative hidden w-full flex-1 lg:block lg:object-contain">
					<div
						className={
							'absolute left-0 top-0 z-20 h-full w-full bg-gradient-to-r from-white via-transparent to-transparent'
						}
					></div>
					<Image
						alt={'background my-makeup'}
						fill
						src="/assets/bg_makeup_alternative.webp"
						className={'z-10 object-cover'}
					></Image>
				</div>
			</div>
		</>
	)
}

export default Signin
