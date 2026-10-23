'use client'

import { useEffect, useRef } from 'react'
import { AUTH_ERROR_CODES } from '@/lib/analytics/events'
import { type Track, track } from '@/lib/analytics/track'
import { GOOGLE_ERROR_CODES } from '@/lib/auth/errors'
import { EXPIRED_SESSION_ERROR } from '@/lib/auth/return-to'

/**
 * What the sign-in page tells the measure when it opens with an `?error=` (ticket 146). `code` is
 * the one the server found in the closed list (`urlError`), never the raw value of the address.
 *
 * - `session-expiree`: `session_expired`, once. Every redirection that says the session ended comes
 *   from a token that ran out, so `where` is `jwt_expire`.
 * - a return from Google that failed: `login_result` (method `google`, the code that is shown) and
 *   `auth_error` (the error page of the live site), once each.
 *
 * Renders nothing.
 */
export function SignInPageEvents({ code, suivre = track }: { code: string | null; suivre?: Track }) {
	const emitted = useRef<string | null>(null)
	useEffect(() => {
		if (code === null || emitted.current === code) return
		emitted.current = code
		if (code === EXPIRED_SESSION_ERROR) {
			suivre('session_expired', { where: 'jwt_expire' })
			return
		}
		const google = GOOGLE_ERROR_CODES.find(candidat => candidat === code)
		const known = AUTH_ERROR_CODES.find(candidat => candidat === code)
		if (google === undefined || known === undefined) return
		suivre('login_result', { method: 'google', ok: false, code: known })
		suivre('auth_error', { code: known })
	}, [code, suivre])
	return null
}
