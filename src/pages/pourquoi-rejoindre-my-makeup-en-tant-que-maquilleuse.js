import Head from 'next/head'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import Hero from '@/components/Global/Hero'
import CTA from '@/components/Global/CTA'
import React from 'react'
import AdvantagesMaquillleuse from '@/components/Maquilleuse/AdvantagesMaquillleuse'

function PourquoiMyMakeup() {
	return (
		<>
			<Head>
				<title>Pourquoi My-Makeup ? en tant que maquilleuse</title>
				<meta
					name="description"
					content="Découvrez pourquoi vous devriez rejoindre My-Makeup en tant que maquilleuse professionnelle"
				/>
				{/*	seo tag canonical link */}
				<link
					rel="canonical"
					href={
						'https://my-makeup.fr/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse'
					}
				/>
			</Head>
			<Nav />
			<main className={'relative'}>
				<Hero
					title={
						<>
							Pourquoi rejoindre{' '}
							<span className={'text-indigo-900'}>My&nbsp;Makeup</span> en tant
							que maquilleuse professionnelle ?
						</>
					}
					description={
						<>
							Découvrez les avantages à rejoindre notre communauté pour
							développer votre activité et atteindre une nouvelle clientèle.
						</>
					}
					isSearchDisplayed={false}
					isCTALoginDisplayed={true}
				/>
				<AdvantagesMaquillleuse />
				<CTA />
			</main>

			<Footer />
		</>
	)
}

export default PourquoiMyMakeup
