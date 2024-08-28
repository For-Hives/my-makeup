import React from 'react'

import Head from 'next/head'

import ViewResumeProfil from '@/components/Profil/Parents/ViewResumeProfil'
import ViewInfosProfil from '@/components/Profil/Parents/ViewInfosProfil'
import Footer from '@/components/Global/Footer'
import Nav from '@/components/Global/Nav'

export default function Profil({ profilData }) {
	const user = profilData
	return (
		<>
			<Head>
				<title>{`${user.attributes.first_name} ${user.attributes.last_name} - My-Makeup`}</title>
				<meta
					content={`Découvrez le profil de la maquilleuse professionnelle de vos rêves ! ${user.attributes.first_name} ${profilData.attributes.last_name}  - ${profilData.attributes.speciality} `}
					name="description"
				/>
				{/*	seo tag canonical link */}
				<link
					href={`https://my-makeup.fr/profil/${user.attributes.username}`}
					rel="canonical"
				/>
			</Head>
			<Nav />
			<main className={'relative'}>
				<>
					<ViewResumeProfil isPublicView={true} user={user} />
					<ViewInfosProfil isPublicView={true} user={user} />
				</>
			</main>
			<Footer />
		</>
	)
}

export async function getStaticPaths() {
	const res = await fetch(
		`${process.env.NEXT_PUBLIC_API_URL}/api/makeup-artistes`,
		{
			headers: {
				// 	token
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			method: 'GET',
		}
	).then(res => res.json())

	/**
	 * format the data for getStaticPaths
	 * @type {{params: {id: *}}[]}
	 */
	const paths = res?.data?.map(record => ({
		params: {
			username: record.attributes.username,
		},
	}))
	return {
		fallback: 'blocking',
		paths,
	}
}

export async function getStaticProps({ params }) {
	let profilData = await fetch(
		`${process.env.NEXT_PUBLIC_API_URL}/api/makeup-artistes?filters[username][$eq]=${params.username}&populate=service_offers.options,network,language,image_gallery,courses,experiences,skills,main_picture`,
		{
			headers: {
				// 	token
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			method: 'GET',
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
		revalidate: 10,
	}
}
