import React, { useEffect } from 'react'
import Head from 'next/head'
import Image from 'next/image'
import { signIn, signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import Link from 'next/link'

function VerificationComplete() {
	const { session } = useSession()
	const router = useRouter()

	useEffect(() => {
		if (session) {
			signOut()
		}
	}, [session])

	return (
		<>
			<Head>
				<title>My Makeup</title>
				<meta
					name="description"
					content="Vérification de profil, sur My-Makeup, la plateforme pour les maquilleuses !"
				/>
				{/*	seo tag canonical link */}
				<link
					rel="canonical"
					href="https://my-makeup.fr/auth/verification-complete"
				/>
			</Head>
			<div className="relative flex h-[95vh] max-h-screen overflow-hidden md:h-screen md:overflow-auto md:bg-white">
				<div className="flex flex-1 flex-col justify-center bg-white px-4 sm:px-6 md:py-12 md:pt-12 lg:flex-none lg:px-20 xl:px-24">
					<div className="mx-auto w-full max-w-sm lg:w-96">
						<Link href={'/'}>
							<span className="sr-only">My Makeup</span>
							<Image
								alt="Logo My Makeup"
								width={50}
								height={50}
								src="/assets/logo_2.webp"
							/>
						</Link>
						<div className={'mt-8'}>
							<h1 className={'my-8 text-2xl font-semibold text-slate-900'}>
								Felicitation ! Votre compte My Makeup est maintenant activé !
							</h1>
							<p className={'text-gray-700'}>
								Vous pouvez désormais vous connecter
							</p>

							<Link href={'/auth/signin'} className="btn-primary-large mt-8">
								Se connecter
							</Link>
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

export default VerificationComplete
