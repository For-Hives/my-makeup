import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { NOINDEX } from '@/lib/seo/robots'

// No page of the authentication or of the space is meant for a search engine (plan 03); the same directive leaves in the header (src/proxy.ts).
export const metadata: Metadata = { robots: NOINDEX }

export default function AuthLayout({ children }: { children: ReactNode }) {
	return children
}
