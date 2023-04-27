import Head from 'next/head'
import React from 'react'
import Image from 'next/image'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import ResumeProfil from '@/components/Profil/ResumeProfil'
import { useQuery } from 'react-query'
import { fetchApi } from '@/services/api'
import { useSession, getSession } from 'next-auth/react'
import _ from 'lodash'

function Profil() {
	// get current user id
	const { data: session, status } = useSession()

	// // get current user data
	// const { isLoading, isError, data, error } = useQuery('makeup-artiste', () => {
	// 	if (status === 'authenticated') {
	// 		fetchApi('users/me', {
	// 			// 	jwt: session.jwt,
	// 		}).then(res => {
	// 			if (res.data) {
	// 				return fetchApi('makeup-artiste/' + res.data.id)
	// 			}
	// 		})
	// 	}
	// })

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
						<ResumeProfil />
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
