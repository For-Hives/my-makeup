import type { Metadata } from 'next'
import { GuideParticulier } from '@/components/static-pages/ClientGuide'
import { GUIDE_SOLUTIONS_PARTICULIERS } from '@/content/static-pages/client-guides'
import { metadonnees } from '@/lib/seo/metadata'

// A fixed page: the same text for everyone, rendered once (the head block holds the search, a client component).
export const metadata: Metadata = metadonnees({
	titre: 'Solutions My-Makeup pour les Particuliers !',
	description:
		'Découvrez comment My-Makeup simplifie la recherche de la maquilleuse professionnelle idéale, grâce à une plateforme simple et intuitive.',
	repli:
		'Découvrez comment My-Makeup simplifie la recherche de la maquilleuse professionnelle idéale, grâce à une plateforme simple et intuitive.',
	chemin: '/solutions/pour-les-particuliers',
})

export default function Page() {
	return <GuideParticulier contenu={GUIDE_SOLUTIONS_PARTICULIERS} />
}
