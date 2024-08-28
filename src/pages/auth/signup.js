import { useForm } from 'react-hook-form'
import React from 'react'

import { signIn, signOut, useSession } from 'next-auth/react'
import { zodResolver } from '@hookform/resolvers/zod'
import Image from 'next/image'
import Head from 'next/head'
import Link from 'next/link'
import * as zod from 'zod'
import _ from 'lodash'

const schema = zod
	.object({
		password: zod
			.string({ required_error: 'Mot de passe est requis' })
			.regex(
				/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[a-zA-Z]).{8,}$/gm,
				'Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial'
			)
			.max(255, 'Mot de passe trop long'),
		email: zod
			.string({ required_error: 'Email est requis' })
			.email('Email invalide')
			.max(255, 'Email trop long'),
		name: zod
			.string({ required_error: 'Le nom de compte est requis' })
			.max(255, 'Le nom de compte est trop long'),
	})
	.required({ password: true, email: true, name: true })

function Signup() {
	const {
		formState: { errors },
		handleSubmit,
		register,
	} = useForm({
		resolver: zodResolver(schema),
	})

	const { data: session } = useSession()

	const onSubmit = data => {
		/**
		 * Signin function with name setted : register mode
		 */
		const result = signIn('credentials', {
			callbackUrl: '/auth/profil',
			email: data.email.trim(),
			password: data.password,
			name: data.name.trim(),
		})
	}

	return (
		<>
			<Head>
				<title>Inscription sur My-Makeup</title>
				<meta
					content="Inscription sur my-makeup.fr la plateforme qui va révolutionner votre
	            recherche de maquilleuses professionnelles, ou votre recherche de client !"
					name="description"
				/>
				<link href="https://fonts.googleapis.com" rel="preconnect" />
				<link crossOrigin href="https://fonts.gstatic.com" rel="preconnect" />
				<link
					href="https://fonts.googleapis.com/css2?family=Roboto:wght@500&display=swap"
					rel="stylesheet"
				/>
				{/*	seo tag canonical link */}
				<link href="https://my-makeup.fr/auth/signup" rel="canonical" />
			</Head>
			<div className="relative flex h-[92vh] max-h-screen overflow-hidden md:h-screen md:overflow-auto md:bg-white">
				<div className="flex flex-1 flex-col justify-center bg-white px-4 sm:px-6 md:py-12 md:pt-12 lg:flex-none lg:px-20 xl:px-24">
					<div className="mx-auto w-full max-w-sm lg:w-96">
						<div>
							<Link href={'/'}>
								<span className="sr-only">My-Makeup</span>
								<Image
									alt="Logo My-Makeup"
									height={50}
									src="/assets/logo.webp"
									width={50}
								/>
							</Link>
							<h2 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">
								{"S'inscrire"}
							</h2>
						</div>
						{!(session && session.user && !_.isEmpty(session.user)) && (
							<div className="mt-8">
								<div>
									<div>
										<h1 className="text-sm font-medium leading-6 text-gray-900">{`S'inscrire sur My-Makeup`}</h1>
										<div className="mt-4 grid grid-cols-1 gap-4">
											<div className={'flex w-full justify-center'}>
												<button
													className="flex h-[40px] w-full flex-nowrap items-center justify-center gap-[12px] rounded-md bg-white px-3 text-gray-500 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:outline-offset-0"
													data-cy="google-signin"
													onClick={() => {
														signIn('facebook', {
															callbackUrl: '/auth/profil',
														})
													}}
												>
													<span className="sr-only">
														{"S'inscrire avec Facebook"}
													</span>
													<Image
														alt={'google logo'}
														className={'h-[18px] w-[18px]'}
														height={18}
														src={'/assets/signin-assets/facebook_logo.svg'}
														width={18}
													/>
													<p
														className={
															'flex flex-nowrap font-[roboto] text-[14px] font-medium text-black/[54%]'
														}
													>
														{"S'inscrire avec Facebook"}
													</p>
												</button>
											</div>

											<div className={'flex w-full justify-center'}>
												<button
													className="flex h-[40px] w-full flex-nowrap items-center justify-center gap-[24px] rounded-md bg-white px-3 text-gray-500 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:outline-offset-0"
													data-cy="google-signin"
													onClick={() => {
														signIn('google', {
															callbackUrl: '/auth/profil',
														})
													}}
												>
													<span className="sr-only">
														{"S'inscrire avec Google"}
													</span>
													<Image
														alt={'google logo'}
														className={'h-[18px] w-[18px]'}
														height={18}
														src={'/assets/signin-assets/google_logo.svg'}
														width={18}
													/>
													<p
														className={
															'flex flex-nowrap font-[roboto] text-[14px] font-medium text-black/[54%]'
														}
													>
														{"S'inscrire avec Google"}
													</p>
												</button>
											</div>
										</div>
									</div>

									<div className="relative mt-6">
										<div
											aria-hidden="true"
											className="absolute inset-0 flex items-center"
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
										className="space-y-6"
										method="POST"
										onSubmit={handleSubmit(onSubmit)}
									>
										<div className="space-y-1">
											<label
												className="block text-sm font-medium leading-6 text-gray-900"
												htmlFor="name"
											>
												Nom
											</label>
											<div className="mt-2">
												<input
													autoComplete="current-password"
													data-cy="name"
													id="name"
													name="name"
													type="text"
													{...register('name', {
														required: true,
													})}
													className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
												/>
												{errors.name && (
													<p className={'mt-2 text-xs text-red-500/80'}>
														{errors.name.message}
													</p>
												)}
											</div>
										</div>
										<div>
											<label
												className="block text-sm font-medium leading-6 text-gray-900"
												htmlFor="email"
											>
												Adresse email
											</label>
											<div className="mt-2">
												<input
													autoComplete="email"
													data-cy="email"
													id="email"
													name="email"
													type="text"
													{...register('email', {
														required: true,
													})}
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
												className="block text-sm font-medium leading-6 text-gray-900"
												htmlFor="password"
											>
												Mot de passe
											</label>
											<div className="mt-2">
												<input
													autoComplete="current-password"
													data-cy="password"
													id="password"
													name="password"
													type="password"
													{...register('password', {
														required: true,
													})}
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
												En vous inscrivant sur My-Makeup vous confirmez que vous
												acceptez les{' '}
												<Link
													className={'text-indigo-700 underline'}
													href={'/cgu'}
													target={'_blank'}
												>
													conditions générales.
												</Link>
											</p>
										</div>
										<div>
											<button
												className="btn-primary-large"
												data-cy="submit"
												type="submit"
											>
												{"S'inscrire"}
											</button>
										</div>
										<div className={'flex items-center justify-center'}>
											Déjà un compte ?&nbsp;
											<Link
												className={
													'font-semibold text-indigo-700 hover:text-indigo-700 hover:underline'
												}
												href={'/auth/signin'}
											>
												Connecte toi
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
									className={
										'radius-2xl my-8 border-2 border-indigo-700 px-4 py-2 text-indigo-700 hover:text-indigo-700 hover:underline'
									}
									href={'/auth/profil'}
								>
									Retourner à mon profil
								</Link>

								<button
									className="btn-primary-large mt-8"
									onClick={() => {
										signOut()
									}}
									type="submit"
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
						className={'z-10 -scale-x-100 transform object-cover'}
						fill
						src="/assets/bg_makeup.webp"
					></Image>
				</div>
			</div>
		</>
	)
}

export default Signup
