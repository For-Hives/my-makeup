'use server'

import config from '@payload-config'
import { cookies, headers } from 'next/headers'
import { getPayload } from 'payload'
import type { PasswordResetState } from '@/components/auth/PasswordResetForm'
import { authLog } from '@/lib/auth/auth-log'
import { PASSWORD_RESET_COOKIE } from '@/lib/auth/forgot-password'
import { resetPassword } from '@/lib/auth/password-reset-payload'

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
	})
	if (!result.ok) return { code: result.code }
	// The cookie is left as it is: it holds a spent code, and deleting it here would make Next render the page
	// again, without a cookie, in place of the confirmation. A reload of the page says « plus valable ».
	return { modifie: true }
}
