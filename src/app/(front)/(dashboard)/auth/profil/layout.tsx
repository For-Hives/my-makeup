import type { ReactNode } from 'react'
import { Footer } from '@/components/gabarit/Footer'
import { Nav } from '@/components/gabarit/Nav'

// The navigation and the footer of the site around her space. The page itself is private and
// rendered for each request (`page.tsx`); this layout reads no session.
export default function ProfilLayout({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-dvh flex-col">
			<Nav />
			<div className="flex flex-1 flex-col">{children}</div>
			<Footer />
		</div>
	)
}
