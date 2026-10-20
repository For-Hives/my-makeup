import type { Metadata } from 'next'
import { Cta } from '@/components/blocks/Cta'
import { Hero } from '@/components/blocks/Hero'
import { ClientBenefits } from '@/components/static-pages/ClientBenefits'
import { pageMetadata } from '@/lib/seo/metadata'

const DESCRIPTION = 'Découvrez pourquoi vous devriez utiliser My-Makeup en tant que particulier & professionnel'

export const metadata: Metadata = pageMetadata({
	titre: 'Pourquoi My-Makeup ? en tant que particulier',
	description: DESCRIPTION,
	repli: DESCRIPTION,
	chemin: '/pourquoi-utiliser-my-makeup-en-tant-que-particulier',
})

export default function Page() {
	return (
		<main className="relative">
			<Hero
				image="/assets/back/maquilleuse_africaine_white.webp"
				titre={
					<>
						Pourquoi utiliser <span className="text-indigo-900">My&nbsp;Makeup</span> en tant que particulier ?
					</>
				}
				description="Découvrez les avantages à utiliser notre plateforme pour développer votre activité et trouver des passionnées expérimentées !"
			/>
			<ClientBenefits />
			<Cta />
		</main>
	)
}
