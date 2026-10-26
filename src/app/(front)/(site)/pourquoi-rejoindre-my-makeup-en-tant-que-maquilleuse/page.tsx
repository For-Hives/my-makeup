import type { Metadata } from 'next'
import { CapsuleImage } from '@/components/art/CapsuleImage'
import { MarqueeBanner } from '@/components/art/MarqueeBanner'
import { TitleAccent } from '@/components/art/TitleWithCapsules'
import { Cta } from '@/components/blocks/Cta'
import { ArtistBenefits } from '@/components/static-pages/ArtistBenefits'
import { ArtPage } from '@/components/static-pages/ArtPage'
import { ARTIST_BENEFITS } from '@/components/static-pages/artist-texts'
import { PageHead } from '@/components/static-pages/PageHead'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = pageMetadata({
	titre: 'Pourquoi My-Makeup ? en tant que maquilleuse',
	description: 'Découvrez pourquoi vous devriez rejoindre My-Makeup en tant que maquilleuse professionnelle',
	repli:
		'Découvrez pourquoi rejoindre My-Makeup en tant que maquilleuse professionnelle : visibilité gratuite, tarifs libres.',
	chemin: '/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse',
})

const BANNER = ['Définissez vos tarifs', 'Visibilité gratuite', 'Vous restez libre']

/** Layout B (tiered arches) under a centred head with a capsule in the title; the script banner closes on the benefits' own titles. */
export default function WhyJoinPage() {
	return (
		<ArtPage>
			<PageHead
				layout="centered"
				drawing="hand-brush"
				glow="rose"
				title={
					<>
						Pourquoi rejoindre <TitleAccent>My&nbsp;Makeup</TitleAccent>{' '}
						<CapsuleImage shape="pill" tint="rose" object="brush" rotate={-12} /> en tant que maquilleuse
						professionnelle ?
					</>
				}
				description="Découvrez les avantages à rejoindre notre communauté pour développer votre activité et atteindre une nouvelle clientèle."
				signUp
			/>
			<ArtistBenefits />
			<div className="py-16 md:py-24">
				<MarqueeBanner
					variant="band"
					label="Les avantages en un mot"
					items={ARTIST_BENEFITS.filter(({ titre }) => BANNER.includes(titre)).map(({ titre }) => titre)}
				/>
			</div>
			<Cta />
		</ArtPage>
	)
}
