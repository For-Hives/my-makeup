import Head from 'next/head'
import React from 'react'
import Image from 'next/image'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import ResumeProfil from '@/components/Profil/Parents/ResumeProfil'
import { getSession, useSession } from 'next-auth/react'
import _ from 'lodash'
import ResponsiveTemporary from '@/components/Global/ResponsiveTemporary'
import InfosProfil from '@/components/Profil/Parents/InfosProfil'
import FullLoader from '@/components/Global/Loader/FullLoader'
import { Router } from 'next/router'

function Profil({ user }) {
	// get current user id
	const { data: session } = useSession()

	if (!user) {
		Router.push('/auth/init-account')
		return <FullLoader />
	}

	return (
		<>
			<Head>
				<title>My Makeup</title>
				<meta
					name="description"
					content="Page de profil sur my-makeup.fr la plateforme qui va révolutionner votre façon de travailler !"
				/>
			</Head>
			<Nav />
			<main className={'relative'}>
				<ResponsiveTemporary />
				<Image
					src={'/assets/coming-soon.svg'}
					alt={'Coming soon'}
					width={'80'}
					height={'80'}
					className={
						'fixed left-0 top-0 z-50 m-4 rounded-full bg-amber-300/75 p-2'
					}
				/>
				{session && session.user && !_.isEmpty(session.user) ? (
					<>
						<ResumeProfil user={user} />
						<InfosProfil user={user} />
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
			`${process.env.NEXT_PUBLIC_API_URL}api/me-makeup`,
			{
				method: 'GET',
				headers: {
					// 	token
					'Content-Type': 'application/json',
					Accept: 'application/json',
					Authorization: `Bearer ${session.jwt}`,
				},
			}
		)

		if (!response.ok) {
			console.log('An error has occurred: ' + response.statusText)
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
			session,
			user: user,
		},
	}
}

export default Profil
