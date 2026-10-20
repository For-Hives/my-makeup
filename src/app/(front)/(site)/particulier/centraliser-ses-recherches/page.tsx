import type { Metadata } from 'next'
import { GuideParticulier } from '@/components/static-pages/ClientGuide'
import { GUIDE_CENTRALISER_SES_RECHERCHES } from '@/content/static-pages/client-guides'
import { metadonnees } from '@/lib/seo/metadata'

// A fixed page: the same text for everyone, rendered once (the head block holds the search, a client component).
export const metadata: Metadata = metadonnees({
	titre: 'Centraliser ses recherches !',
	description:
		'Apprenez comment centraliser et organiser vos recherches pour comparer efficacement les maquilleuses et trouver celle qui vous correspond le mieux.',
	repli:
		'Apprenez comment centraliser et organiser vos recherches pour comparer efficacement les maquilleuses et trouver celle qui vous correspond le mieux.',
	chemin: '/particulier/centraliser-ses-recherches',
})

export default function Page() {
	return <GuideParticulier contenu={GUIDE_CENTRALISER_SES_RECHERCHES} />
}
