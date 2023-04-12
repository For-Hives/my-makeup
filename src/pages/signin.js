import Head from 'next/head'
import React from 'react'
import Image from 'next/image'
import Link from 'next/link'

function Signin() {
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
			<div className="bg- flex min-h-screen">
				<div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
					<div className="mx-auto w-full max-w-sm lg:w-96">
						<div>
							<span className="sr-only">My Makeup</span>
							<Image
								alt="Logo My Makeup"
								width={50}
								height={50}
								src="/assets/logo_2.webp"
							/>
							<h2 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">
								Connecte toi !
							</h2>
						</div>
						<div className="mt-8">
							<div>
								<div>
									<p className="text-sm font-medium leading-6 text-gray-900">
										Se connecter
									</p>
									<div className="mt-2 grid grid-cols-3 gap-3">
										<div>
											<a
												href="#"
												className="inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-gray-500 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:outline-offset-0"
											>
												<span className="sr-only">
													Se connecter via Facebook
												</span>
												<svg
													className="h-5 w-5"
													aria-hidden="true"
													fill="currentColor"
													viewBox="0 0 20 20"
												>
													<path
														fillRule="evenodd"
														d="M20 10c0-5.523-4.477-10-10-10S0 4.477 0 10c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V10h2.54V7.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V10h2.773l-.443 2.89h-2.33v6.988C16.343 19.128 20 14.991 20 10z"
														clipRule="evenodd"
													/>
												</svg>
											</a>
										</div>

										<div>
											<a
												href="#"
												className="inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-gray-500 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:outline-offset-0"
											>
												<span className="sr-only">
													Se connecter via instagram
												</span>
												<svg
													className="h-5 w-5"
													aria-hidden="true"
													viewBox="0 0 512 512"
													xmlns="http://www.w3.org/2000/svg"
													fill="currentColor"
												>
													<circle cx="256" cy="256" r="52.5" />
													<path d="m256 6c-138.071 0-250 111.929-250 250s111.929 250 250 250 250-111.929 250-250-111.929-250-250-250zm154.458 313.54c-1.2 23.768-7.879 47.206-25.2 64.343-17.489 17.3-41.038 23.746-65.035 24.934h-128.445c-24-1.188-47.546-7.63-65.035-24.934-17.322-17.137-24-40.575-25.2-64.343v-127.08c1.2-23.768 7.879-47.206 25.2-64.344 17.489-17.3 41.038-23.746 65.035-24.933h128.444c24 1.187 47.546 7.63 65.035 24.933 17.322 17.138 24 40.576 25.2 64.344z" />
													<path d="m318.6 132.138c-31.286-.858-93.906-.858-125.192 0-16.281.447-34.738 4.5-46.338 16.89-12.054 12.879-16.609 28.439-17.071 45.846-.812 30.552 0 122.252 0 122.252.529 17.405 5.017 32.967 17.071 45.846 11.6 12.394 30.057 16.443 46.338 16.89 31.286.858 93.906.858 125.192 0 16.281-.447 34.738-4.5 46.338-16.89 12.054-12.879 16.609-28.439 17.071-45.846v-122.252c-.462-17.407-5.017-32.967-17.071-45.846-11.604-12.394-30.061-16.443-46.338-16.89zm-62.6 205.237a81.375 81.375 0 1 1 81.375-81.375 81.375 81.375 0 0 1 -81.375 81.375zm81.721-145.953a16.275 16.275 0 1 1 16.279-16.275 16.275 16.275 0 0 1 -16.279 16.275z" />
												</svg>
											</a>
										</div>

										<div>
											<a
												href="#"
												className="inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-gray-500 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:outline-offset-0"
											>
												<span className="sr-only">Se connecter via Google</span>
												<svg
													className="h-5 w-5"
													aria-hidden="true"
													fill="currentColor"
													viewBox="0 0 32 32"
													xmlns="http://www.w3.org/2000/svg"
												>
													<g id="OUTLINE_copy_2">
														<g>
															<path d="m16 0c-8.837 0-16 7.164-16 16s7.163 16 16 16c8.836 0 16-7.164 16-16s-7.163-16-16-16zm.173 24.596c-4.749 0-8.596-3.847-8.596-8.596s3.847-8.596 8.596-8.596c2.321 0 4.261.855 5.748 2.24l-2.423 2.423v-.005c-.902-.86-2.047-1.3-3.325-1.3-2.836 0-5.141 2.396-5.141 5.232s2.305 5.238 5.141 5.238c2.573 0 4.325-1.472 4.685-3.492h-4.685v-3.353h8.085c.107.574.166 1.177.166 1.805 0 4.912-3.288 8.404-8.251 8.404z" />
														</g>
													</g>
												</svg>
											</a>
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
								<form action="#" method="POST" className="space-y-6">
									<div>
										<label
											htmlFor="email"
											className="block text-sm font-medium leading-6 text-gray-900"
										>
											Adresse email
										</label>
										<div className="mt-2">
											<input
												id="email"
												name="email"
												type="email"
												autoComplete="email"
												required
												className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
											/>
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
												id="password"
												name="password"
												type="password"
												autoComplete="current-password"
												required
												className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
											/>
										</div>
									</div>

									<div className="flex items-center justify-end">
										<p className={'text-xs'}>
											En entrant sur My-Makeup vous confirmez que vous acceptez
											les conditions générales.
										</p>
									</div>
									<div className="flex items-center justify-end">
										<div className="text-sm">
											<a
												href="#"
												className="font-medium text-indigo-700 hover:text-indigo-500"
											>
												J&apos;ai perdu mon mot de passe
											</a>
										</div>
									</div>

									<div>
										<button type="submit" className="btn-primary-large">
											Se connecter
										</button>
									</div>
									<div className={'flex items-center justify-center '}>
										tu n&apos;as pas de compte ?&nbsp;
										<Link
											className={
												'font-semibold text-indigo-700 hover:text-indigo-700 hover:underline'
											}
											href={'/signup'}
										>
											Inscris-toi
										</Link>
									</div>
								</form>
							</div>
						</div>
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
						src="/assets/bg_makeup.webp"
						className={'z-10 -scale-x-100 transform object-cover'}
					></Image>
				</div>
			</div>
		</>
	)
}

export default Signin
