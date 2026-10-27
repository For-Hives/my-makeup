import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { BackArrow } from '@/components/dashboard/BackArrow'
import { NOINDEX } from '@/lib/seo/robots'

// No page of the authentication or of the space is meant for a search engine (plan 03); the same directive leaves in the header (src/proxy.ts).
export const metadata: Metadata = { robots: NOINDEX }

/**
 * The one layout of `/auth`. It draws the back arrow of her space (27/10/2026) above the page: the arrow decides by the
 * address whether to show itself, so no page of the space carries its own.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
	return (
		<>
			<BackArrow />
			{children}
		</>
	)
}
