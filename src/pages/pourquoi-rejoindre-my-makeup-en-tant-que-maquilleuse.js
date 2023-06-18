import Head from 'next/head'
import Image from 'next/image'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import ResponsiveTemporary from '@/components/Global/ResponsiveTemporary'
import Hero from '@/components/Global/Hero'
import CTA from '@/components/Global/CTA'
import React from 'react'
import AdvantagesMaquillleuse from '@/components/Maquilleuse/AdvantagesMaquillleuse'

function PourquoiMyMakeup() {
	return (
		<>
			<Head>
				<title>Pourquoi My Makeup ?</title>
				<meta
					name="description"
					content="Découvrez pourquoi vous devriez rejoindre My Makeup en tant que maquilleuse professionnelle"
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
				/>
				<AdvantagesMaquillleuse />
				<CTA />
			</main>

			<Footer />
		</>
	)
}

export default PourquoiMyMakeup
