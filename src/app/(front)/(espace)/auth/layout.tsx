import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { NOINDEX } from '@/lib/seo/robots'

// Every page of the account is read by no search engine; the same directive leaves in the header (src/proxy.ts).
export const metadata: Metadata = { robots: NOINDEX }

export default function AuthLayout({ children }: { children: ReactNode }) {
	return children
}
