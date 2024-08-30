import Collaboration from '@/components/Home/Collaboration'
import Presentation from '@/components/Home/Presentation'
import Footer from '@/components/Global/Footer'
import Talents from '@/components/Home/Talents'
import Project from '@/components/Home/Project'
import Hero from '@/components/Global/Hero'
import Nav from '@/components/Global/Nav'
import CTA from '@/components/Global/CTA'
import MOTD from '@/services/MOTD'

export const metadata = {
	description: `Trouvez la meilleure maquilleuse professionnelle à domicile près de chez. Une maquilleuse rien que pour vous,pour un événement, un shooting, ou une soirée,
                    vous trouverez votre bonheur pour vous sublimer dans n'importe quelle situation ! Inscription gratuite.`,
	title: 'Accueil - My-Makeup le moteur de recherche pour les maquilleuses',
	// seo tag canonical link
	alternates: { canonical: 'https://my-makeup.fr' },
}

export default async function Home() {
	MOTD()

	const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/talents`, {
		headers: {
			// 	token
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		method: 'GET',
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
				<Talents talents={talents} />
				<Collaboration />
				<Project />
				<CTA />
			</main>
			<Footer />
		</>
	)
}
