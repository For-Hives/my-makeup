import type { ReactNode } from 'react'
import { ClickMeasure } from '@/components/analytics/ClickMeasure'
import { Footer } from '@/components/layout/Footer'
import { Nav } from '@/components/layout/Nav'

// The template of every public page: navigation, content, footer. It reads no cookie and no
// session, so the pages stay static; the signed-in state of the navigation is read in the browser
// (ticket 078).
export default function SiteLayout({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-dvh flex-col">
			<ClickMeasure />
			<Nav />
			<div className="flex flex-1 flex-col">{children}</div>
			<Footer />
		</div>
	)
}
