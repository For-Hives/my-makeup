'use client'

import { useEffect } from 'react'
import { createExtension } from '@/lib/auth/extend'

// One renewal per page load, even if the component mounts twice (React strict mode, client navigation).
const prolonger = createExtension(route => fetch(route, { method: 'POST', credentials: 'same-origin' }))

/**
 * Renews the session of a makeup artist who visits her space and whose session ends in less than
 * 7 days (ticket 079). Rendered by the private pages only, never by a public page. It draws nothing.
 * `expire` is the end of the session (Unix seconds), read by the server from the cookie that the
 * browser keeps out of reach of the page.
 */
export function RafraichirSession({ expire }: { expire: number | null }) {
	useEffect(() => {
		void prolonger(expire)
	}, [expire])
	return null
}
