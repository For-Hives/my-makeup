import React from 'react'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import Head from 'next/head'
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
			<Nav />
			<main className={'relative'}>
				<Confidentialite />
				<CTA />
			</main>
			<Footer />
		</>
	)
}

export default PolitiqueDeConfidentialite
