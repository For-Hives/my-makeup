import type { Metadata } from 'next'
import { Cta } from '@/components/blocks/Cta'
import { Hero } from '@/components/blocks/Hero'
import { ArtistBenefits } from '@/components/static-pages/ArtistBenefits'
import { ContentPage } from '@/components/static-pages/EditorialArticle'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = pageMetadata({
	titre: 'Pourquoi My-Makeup ? en tant que maquilleuse',
	description: 'Découvrez pourquoi vous devriez rejoindre My-Makeup en tant que maquilleuse professionnelle',
	repli:
		'Découvrez pourquoi rejoindre My-Makeup en tant que maquilleuse professionnelle : visibilité gratuite, tarifs libres.',
	chemin: '/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse',
})

export default function WhyJoinPage() {
	return (
		<ContentPage>
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
			<ArtistBenefits />
			<Cta />
		</ContentPage>
	)
}
