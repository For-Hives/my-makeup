import type { Metadata } from 'next'
import { CapsuleImage } from '@/components/art/CapsuleImage'
import { MarqueeBanner } from '@/components/art/MarqueeBanner'
import { TitleAccent } from '@/components/art/TitleWithCapsules'
import { Cta } from '@/components/blocks/Cta'
import { AboutArticle } from '@/components/static-pages/AboutArticle'
import { ArtPage } from '@/components/static-pages/ArtPage'
import { ABOUT } from '@/components/static-pages/artist-texts'
import { PageHead } from '@/components/static-pages/PageHead'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = pageMetadata({
	titre: 'My-Makeup la plateforme de recherche de maquilleuse !',
	description:
		'Apprenez-en plus sur My-Makeup, votre plateforme de mise en relation entre maquilleuses professionnelles et clients.',
	repli: 'My-Makeup met en relation des maquilleuses professionnelles et des clients : découvrez qui nous sommes.',
	chemin: '/a-propos',
})

/** The kit's layout D (statement and two arches) under a centred head with a capsule in the title; the banner is the mission, in the page's words. */
export default function AboutPage() {
	return (
		<ArtPage>
			<PageHead
				layout="centered"
				drawing="lips"
				glow="indigo"
				title={
					<>
						La solution de vos rêves&nbsp;:&nbsp;<TitleAccent>My&nbsp;Makeup</TitleAccent>{' '}
						<CapsuleImage shape="pill" tint="blush" line="lips" />
					</>
				}
				description="Découvrez comment My-Makeup peut aider les personnes à trouver la maquilleuse professionnelle qui leur correspond. Et comment nous pouvons aider les maquilleuses professionnelles à présenter leur travail et à se faire connaître de nouveaux clients."
				signUp
			/>
			<AboutArticle eyebrow="À propos" contenu={ABOUT} />
			<div className="pb-16 md:pb-24">
				<MarqueeBanner variant="band" label="La mission de My-Makeup" items={['Rendre la beauté accessible à tous']} />
			</div>
			<Cta />
		</ArtPage>
	)
}
