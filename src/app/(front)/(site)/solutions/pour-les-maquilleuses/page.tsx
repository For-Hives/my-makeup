import type { Metadata } from 'next'
import { Cta } from '@/components/blocks/Cta'
import { Hero } from '@/components/blocks/Hero'
import { ARTIST_SOLUTIONS } from '@/components/static-pages/artist-texts'
import { ContentPage } from '@/components/static-pages/EditorialArticle'
import { PageArticle } from '@/components/static-pages/PageArticle'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = pageMetadata({
	titre: 'Solutions My-Makeup pour les Maquilleuses !',
	description: "Avec notre plateforme, donner un coup de boost à votre carrière n'a jamais été aussi simple !",
	repli:
		'Une plateforme gratuite pour présenter votre travail de maquilleuse et vous faire connaître des particuliers.',
	chemin: '/solutions/pour-les-maquilleuses',
})

export default function ArtistSolutionsPage() {
	return (
		<ContentPage>
			<Hero
				image="/assets/back/maquilleuse_asiatique_white.webp"
				titre={
					<>
						Développez Votre Carrière de Maquilleuse avec&nbsp;
						<span className="text-indigo-900">My&nbsp;Makeup&nbsp;</span>
						La solution de vos rêves&nbsp;!
					</>
				}
				description="Découvrez comment My-Makeup peut aider les maquilleuses professionnelles à présenter leur travail et à se faire connaître des particuliers qui cherchent une maquilleuse, gratuitement."
				recherche={false}
				inscription
			/>
			<PageArticle eyebrow="Solutions" contenu={ARTIST_SOLUTIONS} />
			<Cta />
		</ContentPage>
	)
}
