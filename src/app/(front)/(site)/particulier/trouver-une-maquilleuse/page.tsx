import type { Metadata } from 'next'
import { GuideParticulier } from '@/components/pages-fixes/GuideParticulier'
import { GUIDE_TROUVER_UNE_MAQUILLEUSE } from '@/content/pages-fixes/guides-particuliers'
import { metadonnees } from '@/lib/seo/metadonnees'

// A fixed page: the same text for everyone, rendered once (the head block holds the search, a client component).
export const metadata: Metadata = metadonnees({
	titre: 'Trouver une maquilleuse !',
	description:
		'Découvrez comment vous pouvez trouver une maquilleuse simplement, et qui correspondra parfaitement à tout vos besoins !',
	repli:
		'Découvrez comment vous pouvez trouver une maquilleuse simplement, et qui correspondra parfaitement à tout vos besoins !',
	chemin: '/particulier/trouver-une-maquilleuse',
})

export default function Page() {
	return <GuideParticulier contenu={GUIDE_TROUVER_UNE_MAQUILLEUSE} />
}
