import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '../globals.css'

export const metadata: Metadata = {
	title: 'My Makeup',
	description: 'Annuaire de maquilleuses professionnelles indépendantes.',
	icons: { icon: '/favicon.webp' },
}

export default function SiteLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="fr">
			<body className="bg-neutral-50 text-neutral-900 antialiased">{children}</body>
		</html>
	)
}
