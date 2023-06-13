import Head from 'next/head'
import Nav from '@/components/Global/Nav'
import Image from 'next/image'
import { useRouter } from 'next/router'
import React from 'react'
import Footer from '@/components/Global/Footer'
import ResponsiveTemporary from '@/components/Global/ResponsiveTemporary'

export default function Profil({ profilData }) {
	let router = useRouter()

	return (
		<>
			<Head>
				<title>{`${profilData.attributes.first_name} ${profilData.attributes.last_name} - My Makeup`}</title>
				<meta
					name="description"
					content={`Découvrez le profil de la maquilleuse professionnelle de vos rêves ! ${profilData.attributes.first_name} ${profilData.attributes.last_name}  - ${profilData.attributes.speciality} `}
				/>
			</Head>
			<div className={'relative'}>
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
				<main className={'relative'}>
					<ResponsiveTemporary />
					Profil
					{profilData.attributes.username}
				</main>
				<Footer />
			</div>
		</>
	)
}

export async function getStaticPaths() {
	const res = await fetch(
		`${process.env.NEXT_PUBLIC_API_URL}api/makeup-artistes`,
		{
			method: 'GET',
			headers: {
				// 	token
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
		}
	).then(res => res.json())

	/**
	 * format the data for getStaticPaths
	 * @type {{params: {id: *}}[]}
	 */
	const paths = res?.data?.map(record => ({
		params: {
			id: record.attributes.username,
		},
	}))
	return {
		paths,
		fallback: false,
	}
}

export async function getStaticProps({ params }) {
	let profilData = await fetch(
		`${process.env.NEXT_PUBLIC_API_URL}api/makeup-artistes?filters[username][$eq]=${params.id}`,
		{
			method: 'GET',
			headers: {
				// 	token
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
		}
	).then(res => res.json())

	profilData = profilData?.data?.[0]

	if (!profilData) {
		return {
			props: { hasError: true },
		}
	}

	return {
		props: {
			profilData,
		},
	}
}
