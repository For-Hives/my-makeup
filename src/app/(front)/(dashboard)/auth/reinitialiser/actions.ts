'use server'

import config from '@payload-config'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import type { PasswordResetState } from '@/components/auth/PasswordResetForm'
import { authLog } from '@/lib/auth/auth-log'
import { PASSWORD_RESET_COOKIE, PASSWORD_RESET_PAGE } from '@/lib/auth/forgot-password'
import { resetPassword } from '@/lib/auth/password-reset-payload'
import { DEFAULT_DASHBOARD } from '@/lib/auth/return-to'
import { setSessionCookie } from '@/lib/auth/set-session-cookie'
import { openWithoutPassword } from '@/lib/auth/token'
import { passwordSignInDestination } from '@/lib/dashboard/sign-in-destination'

/**
 * The second step of the forgotten password (tickets 085 and 086): the code comes from the cookie
 * the proxy kept it in, never from the form.
 */
export async function choosePassword(
	_precedent: PasswordResetState,
	formulaire: FormData
): Promise<PasswordResetState> {
	const payload = await getPayload({ config })
	const requestHeaders = await headers()
	const requestOrigin = requestHeaders.get('origin')
	if (requestOrigin !== null && !payload.config.csrf.includes(requestOrigin)) return { code: 'service-indisponible' }

	const jar = await cookies()
	const result = await resetPassword({
		payload,
		headers: requestHeaders,
		jeton: jar.get(PASSWORD_RESET_COOKIE)?.value,
		motDePasse: formulaire.get('password'),
		confirmation: formulaire.get('password-confirmation'),
		journal: authLog(payload),
		// The new password opens her session (ticket 302): the only one of the account, the others were closed.
		ouvrirSession: openWithoutPassword,
	})
	if (!result.ok) return { code: result.code }
	// No session (blocked, address never confirmed, a failure): the screen of before. The cookie is left as it
	// is: it holds a spent code, and deleting it here would make Next render the page again, without a cookie,
	// in place of the confirmation. A reload of the page says « plus valable ».
	if (!result.token) return { modifie: true }
	await setSessionCookie(payload, result.token)
	jar.delete({ name: PASSWORD_RESET_COOKIE, path: PASSWORD_RESET_PAGE })
	// The same destination as a sign-in with no precise page (ticket 296). `redirect` throws: it stays outside any try/catch.
	redirect(await passwordSignInDestination(payload, result.token, DEFAULT_DASHBOARD))
}
