import React, { useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import Image from 'next/image'
import { signIn, signOut, useSession } from 'next-auth/react'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import _ from 'lodash'
import ResponsiveTemporary from '@/components/Global/ResponsiveTemporary'
import { useRouter } from 'next/router'

function InitAccount() {
	console.log('InitAccount')
	const { data: session } = useSession()
	const router = useRouter()

	useEffect(() => {
		if (!session) return

		fetch(`${process.env.NEXT_PUBLIC_API_URL}api/me-makeup`, {
			method: 'POST',
			headers: {
				// 	token
				'Content-Type': 'application/json',
				Accept: 'application/json',
				Authorization: `Bearer ${session.jwt}`,
			},
			body: JSON.stringify({}),
		})
			.then(response => {
				if (response.status === 200) {
					console.log('response', response.body)
				}
			})
			.catch(err => {
				console.log(err)
			})
	}, [session])

	console.log('user', session?.user)

	return (
		<>
			<Head>
				<title>My Makeup</title>
				<meta
					name="description"
					content="Inscription sur my-makeup.fr la plateforme qui va révolutionner votre
	            recherche de maquilleuses professionnelles, ou votre recherche de client !"
				/>
			</Head>
			<div className="relative flex min-h-screen bg-white">
				{/*<ResponsiveTemporary />*/}
				<div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
					<div className="mx-auto w-full max-w-sm lg:w-96">
						<div>
							<span className="sr-only">My Makeup</span>
							<Image
								alt="Logo My Makeup"
								width={50}
								height={50}
								src="/assets/logo_2.webp"
							/>
							<h2 className="mt-6 text-3xl font-bold tracking-tight text-slate-900">
								{'Bienvenue sur My Makeup'}
							</h2>
							<h3>
								Rendez-vous sur votre espace personnel pour compléter votre
								profil
							</h3>
						</div>
						{!!(session && session.user && !_.isEmpty(session.user)) && (
							<div className={'mt-8'}>
								<button
									type="submit"
									className="btn-primary-large"
									onClick={() => {
										router.push('/profil')
									}}
								>
									Mon Profil
								</button>
							</div>
						)}
					</div>
				</div>
				<div className="relative hidden w-full flex-1 lg:block lg:object-contain">
					<div
						className={
							'absolute left-0 top-0 z-20 h-full w-full bg-gradient-to-r from-white via-transparent to-transparent'
						}
					></div>
					<Image
						alt={'background my-makeup'}
						fill
						src="/assets/bg_makeup.webp"
						className={'z-10 -scale-x-100 transform object-cover'}
					></Image>
				</div>
			</div>
		</>
	)
}

export default InitAccount
