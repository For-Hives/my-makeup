import type { Metadata } from 'next'
import { Cta } from '@/components/blocks/Cta'
import { Hero } from '@/components/blocks/Hero'
import { PARTNERSHIPS } from '@/components/static-pages/artist-texts'
import { ContentPage } from '@/components/static-pages/EditorialArticle'
import { PageArticle } from '@/components/static-pages/PageArticle'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = pageMetadata({
	titre: 'Communauté et partenariats !',
	marque: false,
	description:
		"Communauté et partenariat chez My-Makeup : une page professionnelle gratuite pour présenter votre travail, et une équipe à l'écoute des maquilleuses.",
	repli: 'Une page professionnelle gratuite pour présenter votre travail, et une équipe à l’écoute des maquilleuses.',
	chemin: '/maquilleuse/partenariats',
})

export default function PartnershipsPage() {
	return (
		<ContentPage>
			<Hero
				image="/assets/back/maquilleuse_italienne_white.webp"
				titre={
					<>
						Communauté et partenariats, avec&nbsp;<span className="text-indigo-900">My&nbsp;Makeup</span>
						&nbsp;présentez votre travail gratuitement !
					</>
				}
				description="Découvrez comment My-Makeup aide les maquilleuses professionnelles à présenter leur travail et à se faire connaître des particuliers."
				recherche={false}
				inscription
			/>
			<PageArticle eyebrow="Maquilleuse" contenu={PARTNERSHIPS} />
			<Cta />
		</ContentPage>
	)
}
