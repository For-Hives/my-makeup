import type { Metadata } from 'next'
import { Cta } from '@/components/blocs/Cta'
import { Hero } from '@/components/blocs/Hero'
import { AvantagesMaquilleuses } from '@/components/pages-fixes/AvantagesMaquilleuses'
import { metadonnees } from '@/lib/seo/metadonnees'

export const metadata: Metadata = metadonnees({
	titre: 'Pourquoi My-Makeup ? en tant que maquilleuse',
	description: 'Découvrez pourquoi vous devriez rejoindre My-Makeup en tant que maquilleuse professionnelle',
	repli:
		'Découvrez pourquoi rejoindre My-Makeup en tant que maquilleuse professionnelle : visibilité gratuite, tarifs libres.',
	chemin: '/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse',
})

export default function PagePourquoiRejoindre() {
	return (
		<main className="relative">
			<Hero
				image="/assets/back/maquilleuse_italienne_white.webp"
				titre={
					<>
						Pourquoi rejoindre <span className="text-indigo-900">My&nbsp;Makeup</span> en tant que maquilleuse
						professionnelle ?
					</>
				}
				description="Découvrez les avantages à rejoindre notre communauté pour développer votre activité et atteindre une nouvelle clientèle."
				recherche={false}
				inscription
			/>
			<AvantagesMaquilleuses />
			<Cta />
		</main>
	)
}
