import type { Metadata } from 'next'
import { Cta } from '@/components/blocks/Cta'
import { Hero } from '@/components/blocks/Hero'
import { ABOUT } from '@/components/static-pages/artist-texts'
import { ContentPage } from '@/components/static-pages/EditorialArticle'
import { PageArticle } from '@/components/static-pages/PageArticle'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = pageMetadata({
	titre: 'My-Makeup la plateforme de recherche de maquilleuse !',
	description:
		'Apprenez-en plus sur My-Makeup, votre plateforme de mise en relation entre maquilleuses professionnelles et clients.',
	repli: 'My-Makeup met en relation des maquilleuses professionnelles et des clients : découvrez qui nous sommes.',
	chemin: '/a-propos',
})

export default function AboutPage() {
	return (
		<ContentPage>
			<Hero
				image="/assets/back/maquilleuse_europeenne_white.webp"
				titre={
					<>
						La solution de vos rêves&nbsp;:&nbsp;<span className="text-indigo-900">My&nbsp;Makeup</span>
					</>
				}
				description="Découvrez comment My-Makeup peut aider les personnes à trouver la maquilleuse professionnelle qui leur correspond. Et comment nous pouvons aider les maquilleuses professionnelles à présenter leur travail et à se faire connaître de nouveaux clients."
				recherche={false}
				inscription
			/>
			<PageArticle eyebrow="À propos" contenu={ABOUT} />
			<Cta />
		</ContentPage>
	)
}
