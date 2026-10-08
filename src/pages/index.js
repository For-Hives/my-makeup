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
import Seo from '@/components/Global/Seo'
import { seoPage } from '@/lib/seo/meta'
import { urlDuSite } from '@/lib/seo/url'

export default function Home({ talents }) {
	MOTD()
	return (
		<>
			<Seo
				seo={seoPage({
					// E9 (plans/03): 60 characters of title, 155 of description at most
					titre: 'Maquilleuse professionnelle près de chez vous | My-Makeup',
					description:
						'Trouvez une maquilleuse professionnelle à domicile près de chez vous, pour un mariage, une soirée ou un shooting. Comparez les profils et les tarifs.',
					chemin: '/',
					site: urlDuSite(),
				})}
			/>

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

	const data = await res.json()

	return {
		props: {
			talents: data.data,
		},
	}
}
