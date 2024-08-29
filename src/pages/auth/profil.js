import React, { useEffect } from 'react'

import { getSession, useSession } from 'next-auth/react'
import Head from 'next/head'
import _ from 'lodash'

import ResumeProfil from '@/components/Profil/Parents/ResumeProfil'
import InfosProfil from '@/components/Profil/Parents/InfosProfil'
import FullLoader from '@/components/Global/Loader/FullLoader'
import DangerZone from '@/components/Global/DangerZone'
import Footer from '@/components/Global/Footer'
import Nav from '@/components/Global/Nav'

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
				<meta
					content="Page de profil sur my-makeup.fr la plateforme qui va révolutionner votre façon de travailler !"
					name="description"
				/>
				{/*	seo tag canonical link */}
				<link href="https://my-makeup.fr/auth/profil" rel="canonical" />
			</Head>
			<Nav isProfileBtnVisible={false} />
			<main className={'relative'}>
				{session && session.user && !_.isEmpty(session.user) ? (
					<>
						<ResumeProfil
							handleUpdateUser={handleUpdateUser}
							isPublic={isPublic}
							user={user}
						/>
						<InfosProfil
							handleIsPublic={handleIsPublic}
							handleUpdateUser={handleUpdateUser}
							isPublic={isPublic}
							user={user}
						/>
						<DangerZone session={session} />
					</>
				) : (
					<div className="flex h-screen flex-col items-center justify-center">
						<h1 className="text-center text-4xl font-bold text-gray-700">
							You are not logged in
						</h1>
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
		const response = await fetch(
			`${process.env.NEXT_PUBLIC_API_URL}/api/me-makeup`,
			{
				headers: {
					Authorization: `Bearer ${session.jwt}`,
					// 	token
					'Content-Type': 'application/json',
					Accept: 'application/json',
				},
				method: 'GET',
			}
		)

		if (!response.ok) {
			res.writeHead(301, { location: '/auth/init-account' })
			res.end()
		} else {
			user = await response.json()
		}
	}

	// Set Cache Control header
	res.setHeader(
		'Cache-Control',
		'public, s-maxage=10, stale-while-revalidate=59'
	)

	return {
		props: {
			data: user ?? null,
			session,
		},
	}
}

export default Profil
