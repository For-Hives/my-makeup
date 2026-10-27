import type { Metadata } from 'next'
import { MarqueeBanner } from '@/components/art/MarqueeBanner'
import { TitleAccent } from '@/components/art/TitleWithCapsules'
import { Cta } from '@/components/blocks/Cta'
import { ArtPage } from '@/components/static-pages/ArtPage'
import { PARTNERSHIPS } from '@/components/static-pages/artist-texts'
import { PageArticle, partTitles } from '@/components/static-pages/PageArticle'
import { PageHead } from '@/components/static-pages/PageHead'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = pageMetadata({
	titre: 'Communauté et partenariats !',
	marque: false,
	description:
		"Communauté et partenariat chez My-Makeup : une page professionnelle gratuite pour présenter votre travail, et une équipe à l'écoute des maquilleuses.",
	repli: 'Une page professionnelle gratuite pour présenter votre travail, et une équipe à l’écoute des maquilleuses.',
	chemin: '/maquilleuse/partenariats',
})

/** Family « maquilleuse » (same layouts as the solutions page, other picture, tint and banner variant: ruled paper). */
export default function PartnershipsPage() {
	return (
		<ArtPage>
			<PageHead
				mirrored
				image="/assets/illustrations/partnerships-shared-table.webp"
				tint="lavender"
				band="rose"
				mark="plus"
				glow="rose"
				title={
					<>
						Communauté et partenariats, avec&nbsp;<TitleAccent>My&nbsp;Makeup</TitleAccent>
						&nbsp;présentez votre travail gratuitement !
					</>
				}
				description="Découvrez comment My-Makeup aide les maquilleuses professionnelles à présenter leur travail et à se faire connaître des particuliers."
				signUp
			/>
			<PageArticle eyebrow="Maquilleuse" contenu={PARTNERSHIPS} />
			<div className="pb-16 md:pb-24">
				<MarqueeBanner variant="rule" label="Les points de la page" items={partTitles(PARTNERSHIPS)} />
			</div>
			<Cta />
		</ArtPage>
	)
}
