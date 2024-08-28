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

export const metadata = {
	title: 'Accueil - My-Makeup le moteur de recherche pour les maquilleuses',
	description: `Trouvez la meilleure maquilleuse professionnelle à domicile près de chez. Une maquilleuse rien que pour vous,pour un événement, un shooting, ou une soirée,
                    vous trouverez votre bonheur pour vous sublimer dans n'importe quelle situation ! Inscription gratuite.`,
	//seo tag canonical link
	robots: { canonical: 'https://my-makeup.fr' },
}

export default async function Home() {
	MOTD()

	const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/talents`, {
		method: 'GET',
		headers: {
			// 	token
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
	})

	if (!res) {
		return {
			notFound: true,
		}
	}

	const { data: talents } = await res.json()
	return (
		<>
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
