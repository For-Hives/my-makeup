import type { Metadata } from 'next'
import { MarqueeBanner } from '@/components/art/MarqueeBanner'
import { solutionImage } from '@/components/art/solution-image'
import { TitleAccent } from '@/components/art/TitleWithCapsules'
import { Cta } from '@/components/blocks/Cta'
import { ArtPage } from '@/components/static-pages/ArtPage'
import { ARTIST_SOLUTIONS } from '@/components/static-pages/artist-texts'
import { PageArticle, partTitles } from '@/components/static-pages/PageArticle'
import { PageHead } from '@/components/static-pages/PageHead'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = pageMetadata({
	titre: 'Solutions My-Makeup pour les Maquilleuses !',
	description: "Avec notre plateforme, donner un coup de boost à votre carrière n'a jamais été aussi simple !",
	repli:
		'Une plateforme gratuite pour présenter votre travail de maquilleuse et vous faire connaître des particuliers.',
	chemin: '/solutions/pour-les-maquilleuses',
})

/** Family « maquilleuse »: the arch on the left of the head (layout A, mirrored), then rows with a capsule each, and a pink banner of the parts' own titles. */
export default function ArtistSolutionsPage() {
	return (
		<ArtPage>
			<PageHead
				mirrored
				image={solutionImage('artistes-head') ?? '/assets/back/maquilleuse_asiatique_white.webp'}
				imageAlt=""
				tint="rose"
				band="night"
				mark="ring"
				glow="indigo"
				title={
					<>
						Développez Votre Carrière de Maquilleuse avec&nbsp;
						<TitleAccent>My&nbsp;Makeup&nbsp;</TitleAccent>
						La solution de vos rêves&nbsp;!
					</>
				}
				description="Découvrez comment My-Makeup peut aider les maquilleuses professionnelles à présenter leur travail et à se faire connaître des particuliers qui cherchent une maquilleuse, gratuitement."
				signUp
			/>
			<PageArticle
				eyebrow="Solutions"
				contenu={ARTIST_SOLUTIONS}
				images={[
					solutionImage('artistes-clients'),
					solutionImage('artistes-vitrine'),
					solutionImage('artistes-agenda'),
				]}
			/>
			<div className="pb-16 md:pb-24">
				<MarqueeBanner variant="blush" label="Les points de la page" items={partTitles(ARTIST_SOLUTIONS)} />
			</div>
			<Cta />
		</ArtPage>
	)
}
