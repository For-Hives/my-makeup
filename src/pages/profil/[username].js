import Head from 'next/head'
import { useRouter } from 'next/router'
import React from 'react'
import Footer from '@/components/Global/Footer'
import ViewResumeProfil from '@/components/Profil/Parents/ViewResumeProfil'
import ViewInfosProfil from '@/components/Profil/Parents/ViewInfosProfil'
import Nav from '@/components/Global/Nav'

export default function Profil({ profilData }) {
	let router = useRouter()

	const user = profilData
	return (
		<>
			<Head>
				<title>{`${user.attributes.first_name} ${user.attributes.last_name} - My-Makeup`}</title>
				<meta
					name="description"
					content={`Découvrez le profil de la maquilleuse professionnelle de vos rêves ! ${user.attributes.first_name} ${profilData.attributes.last_name}  - ${profilData.attributes.speciality} `}
				/>
				{/*	seo tag canonical link */}
				<link
					rel="canonical"
					href={`https://my-makeup.fr/profil/${user.attributes.username}`}
				/>
			</Head>
			<Nav />
			<main className={'relative'}>
				<>
					<ViewResumeProfil user={user} isPublicView={true} />
					<ViewInfosProfil user={user} isPublicView={true} />
				</>
			</main>
			<Footer />
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
			username: record.attributes.username,
		},
	}))
	return {
		paths,
		fallback: false,
	}
}

export async function getStaticProps({ params }) {
	let profilData = await fetch(
		`${process.env.NEXT_PUBLIC_API_URL}api/makeup-artistes?filters[username][$eq]=${params.username}&populate=service_offers.options,network,language,image_gallery,courses,experiences,skills,main_picture`,
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
		revalidate: 10,
	}
}
