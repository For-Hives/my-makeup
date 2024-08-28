import React from 'react'

import Head from 'next/head'

import AdvantagesMaquillleuse from '@/components/Maquilleuse/AdvantagesMaquillleuse'
import Footer from '@/components/Global/Footer'
import Hero from '@/components/Global/Hero'
import Nav from '@/components/Global/Nav'
import CTA from '@/components/Global/CTA'

function PourquoiMyMakeup() {
	return (
		<>
			<Head>
				<title>Pourquoi My-Makeup ? en tant que maquilleuse</title>
				<meta
					content="Découvrez pourquoi vous devriez rejoindre My-Makeup en tant que maquilleuse professionnelle"
					name="description"
				/>
				{/*	seo tag canonical link */}
				<link
					href={
						'https://my-makeup.fr/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse'
					}
					rel="canonical"
				/>
			</Head>
			<Nav />
			<main className={'relative'}>
				<Hero
					description={
						<>
							Découvrez les avantages à rejoindre notre communauté pour
							développer votre activité et atteindre une nouvelle clientèle.
						</>
					}
					imgBackgroundSrc={'/assets/back/maquilleuse_italienne_white.webp'}
					isCTALoginDisplayed={true}
					isSearchDisplayed={false}
					title={
						<>
							Pourquoi rejoindre{' '}
							<span className={'text-indigo-900'}>My&nbsp;Makeup</span> en tant
							que maquilleuse professionnelle ?
						</>
					}
				/>
				<AdvantagesMaquillleuse />
				<CTA />
			</main>

			<Footer />
		</>
	)
}

export default PourquoiMyMakeup
