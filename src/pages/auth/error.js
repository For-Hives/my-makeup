import React, { useEffect } from 'react'
import Head from 'next/head'
import Image from 'next/image'
import { signIn, signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import Loader from '@/components/Global/Loader'

function VerificationWall() {
	const { session } = useSession()
	const router = useRouter()

	useEffect(() => {
		if (session) {
			signOut()
		}

		router.push('/auth/signin')
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
				<Loader />
			</div>
		</>
	)
}

export default VerificationWall
