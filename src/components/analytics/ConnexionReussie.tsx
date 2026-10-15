'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { COOKIE_DE_MARQUE_PERIME, methodeDeLaMarque } from '@/lib/analytics/marque-connexion'
import { type Suivre, track } from '@/lib/analytics/track'

/**
 * Sends `login_result` for a sign-in that worked (ticket 146), email or Google, on the first page
 * she lands on. The server left a mark in a cookie (`marque-connexion.ts`); it is spent as soon as
 * it is read, so the event leaves once, whatever happens next. Renders nothing.
 *
 * It runs on every change of path: the password sign-in ends in a client-side navigation, which
 * does not mount the layout again.
 */
export function ConnexionReussie({ suivre = track }: { suivre?: Suivre }) {
	const chemin = usePathname()
	useEffect(() => {
		try {
			const methode = methodeDeLaMarque(document.cookie)
			if (methode === null) return
			// biome-ignore lint/suspicious/noDocumentCookie: spending a cookie the server left readable on purpose
			document.cookie = COOKIE_DE_MARQUE_PERIME
			suivre('login_result', { method: methode, ok: true, code: 'ok' })
		} catch {
			// A measure never breaks a page.
		}
	}, [chemin, suivre])
	return null
}
