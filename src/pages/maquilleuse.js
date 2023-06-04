import Head from 'next/head'
import Image from 'next/image'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import ResponsiveTemporary from '@/components/Global/ResponsiveTemporary'
import Hero from '@/components/Global/Hero'
import CTA from '@/components/Global/CTA'
import React from 'react'
import Advantages from '@/components/Maquilleuse/Advantages'

/**
 * @param props
 * @constructor
 */
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
					<Hero
						title={
							<>
								Pourquoi rejoindre{' '}
								<span className={'text-indigo-900'}>My&nbsp;Makeup</span> en
								tant que maquilleuse professionnelle ?
							</>
						}
						description={
							<>
								Découvrez les avantages à rejoindre notre communauté pour
								développer votre activité et atteindre une nouvelle clientèle.
							</>
						}
					/>
					<Advantages />
					<CTA />
				</main>
			</div>

			<Footer />
		</>
	)
}

export default PourquoiMyMakeup
