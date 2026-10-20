'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { EXPIRED_MARK_COOKIE, markMethod } from '@/lib/analytics/sign-in-mark'
import { type Track, track } from '@/lib/analytics/track'

/**
 * Sends `login_result` for a sign-in that worked (ticket 146), email or Google, on the first page
 * she lands on. The server left a mark in a cookie (`marque-connexion.ts`); it is spent as soon as
 * it is read, so the event leaves once, whatever happens next. Renders nothing.
 *
 * It runs on every change of path: the password sign-in ends in a client-side navigation, which
 * does not mount the layout again.
 */
export function SignInSucceeded({ suivre = track }: { suivre?: Track }) {
	const path = usePathname()
	useEffect(() => {
		try {
			const method = markMethod(document.cookie)
			if (method === null) return
			// biome-ignore lint/suspicious/noDocumentCookie: spending a cookie the server left readable on purpose
			document.cookie = EXPIRED_MARK_COOKIE
			suivre('login_result', { method: method, ok: true, code: 'ok' })
		} catch {
			// A measure never breaks a page.
		}
	}, [path, suivre])
	return null
}
