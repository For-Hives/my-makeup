import React, { useEffect } from 'react'
import Head from 'next/head'
import { signIn, signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { toast } from 'react-toastify'
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
			toast('Veuillez confirmer votre adresse email', {
				icon: '⚠️',
				type: 'error',
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
					name="description"
					content="Connexion sur my-makeup.fr la plateforme qui va révolutionner votre
	            recherche de maquilleuses professionnelles, ou votre recherche de client !"
				/>
				{/*	seo tag canonical link */}
				<link rel="canonical" href="https://my-makeup.fr/auth/error" />
			</Head>
			<div className="relative flex min-h-screen bg-white">
				<FullLoader />
			</div>
		</>
	)
}

export default Error
