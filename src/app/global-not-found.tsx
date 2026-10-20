import './(front)/globals.css'
import { MesureDePageIntrouvable } from '@/components/analytics/MesureDePage'
import { Footer } from '@/components/layout/Footer'
import { Nav } from '@/components/layout/Nav'
import { PageIntrouvable } from '@/components/layout/NotFoundPage'
import { metadonneesIntrouvable } from '@/lib/seo/metadata'

export const metadata = metadonneesIntrouvable('Page non trouvée')

// The 404 of an address no route matches (the app has two root layouts, so no layout wraps it):
// it brings its own shell, the same as the pages of the site.
export default function GlobalNotFound() {
	return (
		<html lang="fr">
			<body className="bg-neutral-50 text-neutral-900 antialiased">
				<MesureDePageIntrouvable />
				<div className="flex min-h-dvh flex-col">
					<Nav />
					<div className="flex flex-1 flex-col">
						<PageIntrouvable />
					</div>
					<Footer />
				</div>
			</body>
		</html>
	)
}
