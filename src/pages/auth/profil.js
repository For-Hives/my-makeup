import Head from 'next/head'
import React, { useEffect } from 'react'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import ResumeProfil from '@/components/Profil/Parents/ResumeProfil'
import { getSession, useSession } from 'next-auth/react'
import _ from 'lodash'
import InfosProfil from '@/components/Profil/Parents/InfosProfil'
import FullLoader from '@/components/Global/Loader/FullLoader'
import DangerZone from '@/components/Global/DangerZone'

function Profil({ data }) {
	const { data: session } = useSession()
	// get current user id

	const [user, setUser] = React.useState(data)
	const [isPublic, setIsPublic] = React.useState(false)

	const handleIsPublic = newIsPublic => {
		setIsPublic(newIsPublic)
	}

	const handleUpdateUser = newUser => {
		setUser(newUser)
	}

	if (!user) {
		return <FullLoader />
	}

	return (
		<>
			<Head>
				<title>My-Makeup</title>
				<meta name="description" content="Page de profil sur my-makeup.fr la plateforme qui va révolutionner votre façon de travailler !" />
				{/*	seo tag canonical link */}
				<link rel="canonical" href="https://my-makeup.fr/auth/profil" />
			</Head>
			<Nav isProfileBtnVisible={false} />
			<main className={'relative'}>
				{session && session.user && !_.isEmpty(session.user) ? (
					<>
						<ResumeProfil user={user} handleUpdateUser={handleUpdateUser} isPublic={isPublic} />
						<InfosProfil user={user} handleUpdateUser={handleUpdateUser} isPublic={isPublic} handleIsPublic={handleIsPublic} />
						<DangerZone />
					</>
				) : (
					<div className="flex h-screen flex-col items-center justify-center">
						<h1 className="text-center text-4xl font-bold text-gray-700">You are not logged in</h1>
					</div>
				)}
			</main>
			<Footer />
		</>
	)
}

export const getServerSideProps = async ({ req, res }) => {
	const session = await getSession({ req })

	let user

	if (session) {
		const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me-makeup`, {
			method: 'GET',
			headers: {
				// 	token
				'Content-Type': 'application/json',
				Accept: 'application/json',
				Authorization: `Bearer ${session.jwt}`,
			},
		})

		if (!response.ok) {
			console.log('An error has occurred: ' + response.statusText)
			res.writeHead(301, { location: '/auth/init-account' })
			res.end()
		} else {
			user = await response.json()
		}
	}

	// Set Cache Control header
	res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=59')

	return {
		props: {
			session,
			data: user ?? null,
		},
	}
}

export default Profil
