import './(front)/globals.css'
import { NotFoundAnalytics } from '@/components/analytics/PageAnalytics'
import { FONT_VARIABLES } from '@/components/art/fonts'
import { Footer } from '@/components/layout/Footer'
import { Nav } from '@/components/layout/Nav'
import { NotFoundPage } from '@/components/layout/NotFoundPage'
import { notFoundMetadata } from '@/lib/seo/metadata'

export const metadata = notFoundMetadata('Page non trouvée')

// The 404 of an address no route matches (the app has two root layouts, so no layout wraps it):
// it brings its own shell, the same as the pages of the site (with the three faces of the kit, as the public layout).
export default function GlobalNotFound() {
	return (
		<html lang="fr" className={FONT_VARIABLES}>
			<body className="bg-neutral-50 text-neutral-900 antialiased">
				<NotFoundAnalytics />
				<div className="flex min-h-dvh flex-col">
					<Nav />
					<div className="flex flex-1 flex-col">
						<NotFoundPage />
					</div>
					<Footer />
				</div>
			</body>
		</html>
	)
}
