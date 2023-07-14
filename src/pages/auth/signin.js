import React from 'react'
import Head from 'next/head'
import Link from 'next/link'
import Image from 'next/image'
import { signIn, signOut, useSession } from 'next-auth/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as zod from 'zod'
import _ from 'lodash'

const schema = zod
	.object({
		email: zod
			.string({ required_error: 'Email est requis' })
			.email('Email invalide'),
		password: zod
			.string({ required_error: 'Mot de passe est requis' })
			.regex(
				/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[a-zA-Z]).{8,}$/gm,
				'Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial'
			),
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

	const onSubmit = data => {
		const result = signIn('credentials', {
			email: data.email,
			password: data.password,
			callbackUrl: '/auth/profil',
		})
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
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin />
				<link
					href="https://fonts.googleapis.com/css2?family=Roboto:wght@500&display=swap"
					rel="stylesheet"
				/>
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
														signIn('facebook', {
															callbackUrl: '/auth/profil',
														})
													}}
													className="flex h-[40px] w-[250px] flex-nowrap items-center justify-start gap-[24px] rounded-md bg-white px-3 text-gray-500 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:outline-offset-0"
												>
													<span className="sr-only">
														Se connecter via Facebook
													</span>
													<Image
														src={'/assets/signin-assets/facebook_logo.svg'}
														alt={'google logo'}
														width={18}
														height={18}
														className={'h-[18px] w-[18px]'}
													/>
													<p
														className={
															'flex flex-nowrap font-[roboto] text-[14px] font-medium text-black/[54%]'
														}
													>
														Se connecter avec Facebook
													</p>
												</button>
											</div>

											<div className={'flex w-full justify-center'}>
												<button
													data-cy="google-signin"
													onClick={() => {
														signIn('google', {
															callbackUrl: '/auth/profil',
														})
													}}
													className="flex h-[40px] w-[250px] flex-nowrap items-center justify-start gap-[24px] rounded-md bg-white px-3 text-gray-500 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:outline-offset-0"
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
															'flex flex-nowrap font-[roboto] text-[14px] font-medium text-black/[54%]'
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

										<div>
											<button
												data-cy="email-signin"
												type="submit"
												className="btn-primary-large"
											>
												Se connecter
											</button>
										</div>
										<div className={'flex items-center justify-center '}>
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
