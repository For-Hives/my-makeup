import React from 'react'

import Head from 'next/head'

import Collaboration from '@/components/Home/Collaboration'
import Presentation from '@/components/Home/Presentation'
import Talents from '@/components/Home/Talents'
import Project from '@/components/Home/Project'
import Hero from '@/components/Global/Hero'
import CTA from '@/components/Global/CTA'
import Nav from '@/components/Global/Nav'
import MOTD from '@/services/MOTD'

async function getTalents() {
	const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/talents`, {
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		method: 'GET',
	})

	if (!res.ok) {
		throw new Error('Failed to fetch talents')
	}

	return res.json()
}

export default async function Home() {
	const talents = await getTalents()

	MOTD()

	return (
		<>
			<Head>
				<title>
					Accueil - My-Makeup le moteur de recherche pour les maquilleuses
				</title>
				<meta
					content="Trouvez la meilleure maquilleuse professionnelle à domicile près de. Une maquilleuse rien que pour vous,pour un événement, un shooting, ou une soirée,
                    vous trouverez votre bonheur pour vous sublimer dans n'importe quelle situation ! Inscription gratuite."
					name="description"
				/>
				<link href="https://my-makeup.fr" rel="canonical" />
			</Head>

			<Nav />
			<main className={'relative'}>
				<Hero
					description={
						<>
							Trouvez la maquilleuse spécialisée dans le domaine que vous
							recherchez, maquillage pour les mariées, maquillage de soirée,
							maquillage professionnel...
						</>
					}
					title={
						<>
							Trouver la maquilleuse qui vous correspond n&apos;a jamais été
							aussi simple
						</>
					}
				/>
				<Presentation />
				<Talents talents={talents.data} />
				<Collaboration />
				<Project />
				<CTA />
			</main>
		</>
	)
}
