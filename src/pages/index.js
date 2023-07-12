import Head from 'next/head'
import Hero from '@/components/Global/Hero'
import Nav from '@/components/Global/Nav'
import Presentation from '@/components/Home/Presentation'
import Footer from '@/components/Global/Footer'
import Talents from '@/components/Home/Talents'
import Collaboration from '@/components/Home/Collaboration'
import React from 'react'
import Project from '@/components/Home/Project'
import CTA from '@/components/Global/CTA'
import MOTD from '@/services/MOTD'

export default function Home({ talents }) {
	MOTD()
	return (
		<>
			<Head>
				<title>
					Accueil - My-Makeup le moteur de recherche pour les maquilleuses
				</title>
				<meta
					name="description"
					content="Trouvez la meilleure maquilleuse professionnelle à domicile près de chez. Une maquilleuse rien que pour vous,pour un événement, un shooting, ou une soirée,
                    vous trouverez votre bonheur pour vous sublimer dans n'importe quelle situation ! Inscription gratuite."
				/>
				{/*	seo tag canonical link */}
				<link rel="canonical" href="https://my-makeup.fr" />
			</Head>

			<Nav />
			<main className={'relative'}>
				<Hero
					title={
						<>
							Trouver la maquilleuse qui vous correspond n&apos;a jamais été
							aussi simple
						</>
					}
					description={
						<>
							Trouvez la maquilleuse spécialisée dans le domaine que vous
							recherchez, maquillage pour les mariées, maquillage de soirée,
							maquillage professionnel...
						</>
					}
				/>
				<Presentation />
				<Talents talents={talents} />
				<Collaboration />
				<Project />
				<CTA />
			</main>
			<Footer />
		</>
	)
}

export async function getServerSideProps() {
	const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}api/talents`, {
		method: 'GET',
		headers: {
			// 	token
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
	})
	const data = await res.json()

	return {
		props: {
			talents: data.data,
		},
	}
}
