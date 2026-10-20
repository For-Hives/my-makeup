import { MesureDePageIntrouvable } from '@/components/analytics/MesureDePage'
import { NotFoundPage } from '@/components/layout/NotFoundPage'
import { notFoundMetadata } from '@/lib/seo/metadata'

export const metadata = notFoundMetadata('Page non trouvée')

// The 404 counts itself once, with the kind of address it was (ticket 145).
export default function NotFoundRoute() {
	return (
		<>
			<MesureDePageIntrouvable />
			<NotFoundPage />
		</>
	)
}
