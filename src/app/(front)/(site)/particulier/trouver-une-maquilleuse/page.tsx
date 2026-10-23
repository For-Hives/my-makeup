import type { Metadata } from 'next'
import { ClientGuide } from '@/components/static-pages/ClientGuide'
import { GUIDE_FIND_AN_ARTIST } from '@/content/static-pages/client-guides'
import { pageMetadata } from '@/lib/seo/metadata'

// A fixed page: the same text for everyone, rendered once (the head block holds the search, a client component).
export const metadata: Metadata = pageMetadata({
	titre: 'Trouver une maquilleuse !',
	marque: false,
	description:
		'Découvrez comment vous pouvez trouver une maquilleuse simplement, et qui correspondra parfaitement à tout vos besoins !',
	repli:
		'Découvrez comment vous pouvez trouver une maquilleuse simplement, et qui correspondra parfaitement à tout vos besoins !',
	chemin: '/particulier/trouver-une-maquilleuse',
})

export default function Page() {
	return <ClientGuide contenu={GUIDE_FIND_AN_ARTIST} />
}
