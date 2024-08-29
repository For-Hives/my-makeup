import React, { useEffect } from 'react'
import { toast } from 'react-toastify'

import { signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import Head from 'next/head'

import FullLoader from '@/components/Global/Loader/FullLoader'

function Error() {
	const { session } = useSession()
	const router = useRouter()
	const [showed, setShowed] = React.useState(false)

	useEffect(() => {
		if (session) {
			signOut()
		}

		if (showed === false) {
			toast('Une erreur est survenue !', {
				toastId: 'toast-alert',
				type: 'error',
				icon: '⚠️',
			})
			setShowed(true)
			router.push('/auth/signin')
		}
	}, [])

	return (
		<>
			<Head>
				<title>My-Makeup</title>
				<meta
					content="Connexion sur my-makeup.fr la plateforme qui va révolutionner votre
	            recherche de maquilleuses professionnelles, ou votre recherche de client !"
					name="description"
				/>
				{/*	seo tag canonical link */}
				<link href="https://my-makeup.fr/auth/error" rel="canonical" />
			</Head>
			<div className="relative flex min-h-screen bg-white">
				<FullLoader />
			</div>
		</>
	)
}

export default Error
