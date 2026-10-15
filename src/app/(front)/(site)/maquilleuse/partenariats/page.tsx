import type { Metadata } from 'next'
import { Cta } from '@/components/blocs/Cta'
import { Hero } from '@/components/blocs/Hero'
import { ArticleDePage } from '@/components/pages-fixes/ArticleDePage'
import { PARTENARIATS } from '@/components/pages-fixes/textes-maquilleuses'
import { metadonnees } from '@/lib/seo/metadonnees'

export const metadata: Metadata = metadonnees({
	titre: 'Communauté et partenariats !',
	description:
		"Communauté et partenariat chez My-Makeup : une page professionnelle gratuite pour présenter votre travail, et une équipe à l'écoute des maquilleuses.",
	repli: 'Une page professionnelle gratuite pour présenter votre travail, et une équipe à l’écoute des maquilleuses.',
	chemin: '/maquilleuse/partenariats',
})

export default function PagePartenariats() {
	return (
		<main className="relative">
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
			<ArticleDePage contenu={PARTENARIATS} />
			<Cta />
		</main>
	)
}
