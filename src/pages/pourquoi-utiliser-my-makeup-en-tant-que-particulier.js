import React from 'react'

import Head from 'next/head'

import AdvantagesParticulier from '@/components/Particulier/AdvantagesParticulier'
import Footer from '@/components/Global/Footer'
import Hero from '@/components/Global/Hero'
import Nav from '@/components/Global/Nav'
import CTA from '@/components/Global/CTA'

/**
 * @param props
 * @constructor
 */
function PourquoiUtiliserMyMakeupEnTantQueParticulier(props) {
	return (
		<>
			<Head>
				<title>Pourquoi My-Makeup ? en tant que particulier</title>
				<meta
					content="Découvrez pourquoi vous devriez utiliser My-Makeup en tant que particulier & professionnel"
					name="description"
				/>
				{/*	seo tag canonical link */}
				<link
					href={
						'https://my-makeup.fr/pourquoi-utiliser-my-makeup-en-tant-que-particulier'
					}
					rel="canonical"
				/>
			</Head>
			<Nav />

			<main className={'relative'}>
				<Hero
					description={
						<>
							Découvrez les avantages à utiliser notre plateforme pour
							développer votre activité et trouver des passionnées expérimentées
							!
						</>
					}
					imgBackgroundSrc={'/assets/back/maquilleuse_africaine_white.webp'}
					title={
						<>
							Pourquoi utiliser{' '}
							<span className={'text-indigo-900'}>My&nbsp;Makeup</span> en tant
							que particulier ?
						</>
					}
				/>
				<AdvantagesParticulier />
				<CTA />
			</main>

			<Footer />
		</>
	)
}

export default PourquoiUtiliserMyMakeupEnTantQueParticulier
