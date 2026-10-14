import type { Metadata } from 'next'
import type { ReactNode } from 'react'

// No page of the authentication or of the space is meant for a search engine (plan 03).
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default function EspaceLayout({ children }: { children: ReactNode }) {
	return children
}
