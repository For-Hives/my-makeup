import Head from 'next/head'
import React from 'react'
import Footer from '@/components/Global/Footer'
import ViewResumeProfil from '@/components/Profil/Parents/ViewResumeProfil'
import ViewInfosProfil from '@/components/Profil/Parents/ViewInfosProfil'
import Nav from '@/components/Global/Nav'
import { fetchPublicApi } from '@/services/publicApi'
import { devisFormUrl } from '@/lib/devis'

export default function Profil({ profilData, devisUrl = null }) {
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
					<ViewResumeProfil
						user={user}
						isPublicView={true}
						devisUrl={devisUrl}
					/>
					<ViewInfosProfil user={user} isPublicView={true} />
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
		fallback: 'blocking',
	}
}

export async function getStaticProps({ params }) {
	// throws if the API is unreachable or answers an error (see fetchPublicApi)
	let profilData = await fetchPublicApi(
		`/api/makeup-artistes?filters[username][$eq]=${encodeURIComponent(params.username)}&populate=service_offers.options,network,language,image_gallery,courses,experiences,skills,main_picture`
	)

	profilData = profilData?.data?.[0]

	if (!profilData) {
		return {
			notFound: true,
			revalidate: 10,
		}
	}

	return {
		props: {
			profilData,
			// quote form (F3a): read here, on the server, and passed as a prop so
			// the server HTML and the browser agree. Inlined when set at build
			// time, read at runtime otherwise (picked up as profiles regenerate).
			devisUrl: devisFormUrl(process.env.NEXT_PUBLIC_DEVIS_FORM_URL),
		},
		revalidate: 10,
	}
}
