import type { Metadata } from 'next'
import { CapsuleImage } from '@/components/art/CapsuleImage'
import { MarqueeBanner } from '@/components/art/MarqueeBanner'
import { TitleAccent } from '@/components/art/TitleWithCapsules'
import { Cta } from '@/components/blocks/Cta'
import { GuideSearch } from '@/components/search/GuideSearch'
import { ArtPage } from '@/components/static-pages/ArtPage'
import { CLIENT_BENEFITS, ClientBenefits } from '@/components/static-pages/ClientBenefits'
import { PageHead } from '@/components/static-pages/PageHead'
import { pageMetadata } from '@/lib/seo/metadata'

const DESCRIPTION = 'Découvrez pourquoi vous devriez utiliser My-Makeup en tant que particulier & professionnel'

export const metadata: Metadata = pageMetadata({
	titre: 'Pourquoi My-Makeup ? en tant que particulier',
	description: DESCRIPTION,
	repli: DESCRIPTION,
	chemin: '/pourquoi-utiliser-my-makeup-en-tant-que-particulier',
})

const BANNER = ['Recherche facile et rapide', 'Des informations claires', 'Contact direct']

/** Layout B (tiered arches) under a centred head with a round capsule in the title; the banner is blush pink and carries the benefits' own titles. */
export default function Page() {
	return (
		<ArtPage>
			<PageHead
				layout="centered"
				drawing="eye"
				glow="indigo"
				title={
					<>
						Pourquoi utiliser <TitleAccent>My&nbsp;Makeup</TitleAccent>{' '}
						<CapsuleImage shape="pill" tint="lavender" object="mirror" rotate={10} /> en tant que particulier ?
					</>
				}
				description="Découvrez les avantages à utiliser notre plateforme pour développer votre activité et trouver des passionnées expérimentées !"
			/>
			<div className="relative z-10 mx-auto max-w-5xl px-6 pb-16">
				<GuideSearch />
			</div>
			<ClientBenefits />
			<div className="py-16 md:py-24">
				<MarqueeBanner
					variant="blush"
					label="Les avantages en un mot"
					items={CLIENT_BENEFITS.filter(({ titre }) => BANNER.includes(titre)).map(({ titre }) => titre)}
				/>
			</div>
			<Cta />
		</ArtPage>
	)
}
