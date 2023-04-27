import React from 'react'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import Head from 'next/head'
import Image from 'next/image'
import CTA from '@/components/Global/CTA'
import Confidentialite from '@/components/Rights/Confidentialite'

function PolitiqueDeConfidentialite(props) {
	return (
		<>
			<Head>
				<title>My Makeup</title>
				<meta
					name="description"
					content="Votre maquilleuse directement chez vous, pour un événement, un shooting, ou une soirée,
                    vous trouverez votre bonheur pour vous sublimer dans n'importe quelle situation !"
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
				<main>
					<Confidentialite />
					<CTA />
					<Footer />
				</main>
			</div>
		</>
	)
}

export default PolitiqueDeConfidentialite
