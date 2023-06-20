import React, { useEffect } from 'react'
import Head from 'next/head'
import Image from 'next/image'
import { signOut, useSession } from 'next-auth/react'

function VerificationWall() {
	const { session } = useSession()

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
				{/*	seo tag canonical link */}
				<link
					rel="canonical"
					href="https://my-makeup.fr/auth/verification-wall"
				/>
			</Head>
			<div className="relative flex min-h-screen bg-white">
				<div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
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
								Veuillez vérifier votre adresse email
							</h2>
							<p>verifiez votre boite mail pour valider votre inscription</p>
							<p>
								{/* eslint-disable-next-line react/no-unescaped-entities */}
								Vous n'avez pas reçu d'email ? regardez dans vos spams !
							</p>
						</div>
					</div>
				</div>
			</div>
		</>
	)
}

export default VerificationWall
