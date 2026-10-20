import type { Metadata } from 'next'
import { ClientGuide } from '@/components/static-pages/ClientGuide'
import { GUIDE_CLIENT_SOLUTIONS } from '@/content/static-pages/client-guides'
import { pageMetadata } from '@/lib/seo/metadata'

// A fixed page: the same text for everyone, rendered once (the head block holds the search, a client component).
export const metadata: Metadata = pageMetadata({
	titre: 'Solutions My-Makeup pour les Particuliers !',
	description:
		'Découvrez comment My-Makeup simplifie la recherche de la maquilleuse professionnelle idéale, grâce à une plateforme simple et intuitive.',
	repli:
		'Découvrez comment My-Makeup simplifie la recherche de la maquilleuse professionnelle idéale, grâce à une plateforme simple et intuitive.',
	chemin: '/solutions/pour-les-particuliers',
})

export default function Page() {
	return <ClientGuide contenu={GUIDE_CLIENT_SOLUTIONS} />
}
