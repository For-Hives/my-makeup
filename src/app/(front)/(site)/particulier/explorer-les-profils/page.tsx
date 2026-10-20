import type { Metadata } from 'next'
import { GuideParticulier } from '@/components/static-pages/ClientGuide'
import { GUIDE_EXPLORER_LES_PROFILS } from '@/content/static-pages/client-guides'
import { metadonnees } from '@/lib/seo/metadata'

// A fixed page: the same text for everyone, rendered once (the head block holds the search, a client component).
export const metadata: Metadata = metadonnees({
	titre: 'Explorer les profils !',
	description:
		'Utilisez la recherche par mot-clé et par ville de My-Makeup pour explorer les profils de maquilleuses et trouver celle qui vous correspond.',
	repli:
		'Utilisez la recherche par mot-clé et par ville de My-Makeup pour explorer les profils de maquilleuses et trouver celle qui vous correspond.',
	chemin: '/particulier/explorer-les-profils',
})

export default function Page() {
	return <GuideParticulier contenu={GUIDE_EXPLORER_LES_PROFILS} />
}
