import React from 'react'
import Footer from '@/components/Global/Footer'
import Nav from '@/components/Global/Nav'
import Head from 'next/head'
import Hero from '@/components/Global/Hero'
import CTA from '@/components/Global/CTA'
import AdvantagesParticulier from '@/components/Particulier/AdvantagesParticulier'

/**
 * @param props
 * @constructor
 */
function PourquoiUtiliserMyMakeupEnTantQueParticulier(props) {
	return (
		<>
			<Head>
				<title>Pourquoi My Makeup ?</title>
				<meta
					name="description"
					content="Découvrez pourquoi vous devriez utiliser My Makeup en tant que particulier & professionnel"
				/>
			</Head>
			<Nav />

			<main className={'relative'}>
				<Hero
					title={
						<>
							Pourquoi utiliser{' '}
							<span className={'text-indigo-900'}>My&nbsp;Makeup</span> en tant
							que particulier ?
						</>
					}
					description={
						<>
							Découvrez les avantages à utiliser notre plateforme pour
							développer votre activité et trouver des passionnées expérimentées
							!
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
