import { MesureDePageIntrouvable } from '@/components/analytics/MesureDePage'
import { PageIntrouvable } from '@/components/gabarit/PageIntrouvable'
import { metadonneesIntrouvable } from '@/lib/seo/metadonnees'

export const metadata = metadonneesIntrouvable('Page non trouvée')

// The 404 counts itself once, with the kind of address it was (ticket 145).
export default function PageNonTrouvee() {
	return (
		<>
			<MesureDePageIntrouvable />
			<PageIntrouvable />
		</>
	)
}
