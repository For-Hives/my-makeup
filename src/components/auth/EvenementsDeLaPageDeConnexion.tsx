'use client'

import { useEffect, useRef } from 'react'
import { CODES_D_ERREUR_D_AUTHENTIFICATION } from '@/lib/analytics/events'
import { type Suivre, track } from '@/lib/analytics/track'
import { CODES_ERREUR_GOOGLE } from '@/lib/auth/erreurs'
import { ERREUR_SESSION_EXPIREE } from '@/lib/auth/retour'

/**
 * What the sign-in page tells the measure when it opens with an `?error=` (ticket 146). `code` is
 * the one the server found in the closed list (`erreurDeLUrl`), never the raw value of the address.
 *
 * - `session-expiree`: `session_expired`, once. Every redirection that says the session ended comes
 *   from a token that ran out, so `where` is `jwt_expire`.
 * - a return from Google that failed: `login_result` (method `google`, the code that is shown) and
 *   `auth_error` (the error page of the live site), once each.
 *
 * Renders nothing.
 */
export function EvenementsDeLaPageDeConnexion({ code, suivre = track }: { code: string | null; suivre?: Suivre }) {
	const emis = useRef<string | null>(null)
	useEffect(() => {
		if (code === null || emis.current === code) return
		emis.current = code
		if (code === ERREUR_SESSION_EXPIREE) {
			suivre('session_expired', { where: 'jwt_expire' })
			return
		}
		const google = CODES_ERREUR_GOOGLE.find(candidat => candidat === code)
		const connu = CODES_D_ERREUR_D_AUTHENTIFICATION.find(candidat => candidat === code)
		if (google === undefined || connu === undefined) return
		suivre('login_result', { method: 'google', ok: false, code: connu })
		suivre('auth_error', { code: connu })
	}, [code, suivre])
	return null
}
