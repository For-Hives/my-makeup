import React, { useEffect } from 'react'
import Head from 'next/head'
import Image from 'next/image'
import { signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/router'

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
					content="Connexion sur my-makeup.fr la plateforme qui va révolutionner votre
	            recherche de maquilleuses professionnelles, ou votre recherche de client !"
				/>
			</Head>
			<div className="relative flex min-h-screen bg-white">
				<div className="flex  flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
					<div className="mx-auto w-full max-w-lg lg:w-full">
						<div>
							<span className="sr-only">My Makeup</span>
							<Image
								alt="Logo My Makeup"
								width={50}
								height={50}
								src="/assets/logo_2.webp"
							/>
							<h2 className="mt-6 text-3xl font-bold tracking-tight text-slate-900">
								Felicitation ! Votre compte est activé !
							</h2>
							<p>Vous pouvez désormais vous connecter</p>

							<button
								onClick={() => router.push('/auth/signin')}
								className="mt-6 flex w-full items-center justify-center rounded-md border border-transparent bg-indigo-600 px-6 py-3 text-base font-medium text-white shadow-sm hover:bg-indigo-700"
							>
								Se connecter
							</button>
						</div>
					</div>
				</div>
			</div>
		</>
	)
}

export default VerificationComplete
