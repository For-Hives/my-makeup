import Head from 'next/head'
import React from 'react'
import Image from 'next/image'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import ResumeProfil from '@/components/Profil/ResumeProfil'
import { useQuery } from '@tanstack/react-query'
import { fetchMeMakeup } from '@/services/api'
import { useSession, getSession } from 'next-auth/react'
import _ from 'lodash'
import Loader from '@/components/Global/Loader'
import { redirect } from 'next/navigation'
import Router from 'next/router'

function Profil() {
	// get current user id
	const { data: session, status } = useSession()

	console.log('session', session)

	// get current user data
	const { isLoading, isError, data, error } = useQuery({
		queryKey: ['users/me'],
		queryFn: async () => {
			const res = await fetch(
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
			return res.json()
		},
	})

	// get current user id
	if (status !== 'authenticated') {
		// 	redirect to signin page
		typeof window !== 'undefined' && Router.push('/signin')
	}

	if (isLoading) return <Loader />

	if (error) return 'An error has occurred: ' + error.message
	const user = data[0]
	return (
		<>
			<Head>
				<title>My Makeup</title>
				<meta
					name="description"
					content="Page de profil sur my-makeup.fr la plateforme qui va révolutionner votre façon de travailler !"
				/>
			</Head>
			<main className={'relative'}>
				<Image
					src={'/assets/coming-soon.svg'}
					alt={'Coming soon'}
					width={'80'}
					height={'80'}
					className={
						'fixed left-0 top-0 z-50 m-4 rounded-full bg-amber-300/75 p-2'
					}
				/>
				<Nav />
				{session && session.user && !_.isEmpty(session.user) ? (
					<>
						<ResumeProfil user={user} />
					</>
				) : (
					<div className="flex h-screen flex-col items-center justify-center">
						<h1 className="text-center text-4xl font-bold text-gray-700">
							You are not logged in
						</h1>
					</div>
				)}
				<Footer />
			</main>
		</>
	)
}

export const getServerSideProps = async ({ req }) => {
	const session = await getSession({ req })
	return {
		props: {
			session,
		},
	}
}

export default Profil
