import Head from 'next/head'
import { Inter } from 'next/font/google'
import Hero from '@/components/Global/Hero'
import Nav from '@/components/Global/Nav'
import Presentation from '@/components/Home/Presentation'
import Footer from '@/components/Global/Footer'
import Talents from '@/components/Home/Talents'
import Collaboration from '@/components/Home/Collaboration'
import Image from 'next/image'
import React from 'react'
import Project from '@/components/Home/Project'
import CTA from '@/components/Global/CTA'
import ResponsiveTemporary from '@/components/Global/ResponsiveTemporary'

const inter = Inter({ subsets: ['latin'] })

export default function Home() {
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
				<main className={'relative'}>
					<ResponsiveTemporary />
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
					<Talents />
					<Collaboration />
					<Project />
					<CTA />
				</main>
				<Footer />
			</div>
		</>
	)
}
