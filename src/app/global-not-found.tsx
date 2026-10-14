import './(front)/globals.css'
import { Footer } from '@/components/gabarit/Footer'
import { Nav } from '@/components/gabarit/Nav'
import { PageIntrouvable } from '@/components/gabarit/PageIntrouvable'
import { metadonneesIntrouvable } from '@/lib/seo/metadonnees'

export const metadata = metadonneesIntrouvable('Page non trouvée')

// The 404 of an address no route matches (the app has two root layouts, so no layout wraps it):
// it brings its own shell, the same as the pages of the site.
export default function GlobalNotFound() {
	return (
		<html lang="fr">
			<body className="bg-neutral-50 text-neutral-900 antialiased">
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
