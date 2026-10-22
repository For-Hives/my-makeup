'use server'

import config from '@payload-config'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import { authLog } from '@/lib/auth/auth-log'
import { ipClient } from '@/lib/auth/client-ip'
import { CONFIRMATION_COOKIE, CONFIRMATION_PAGE } from '@/lib/auth/confirmation-link'
import { ACCOUNT_ONBOARDING_PAGE, signInUrl } from '@/lib/auth/return-to'
import { openSessionAfterConfirmation } from '@/lib/auth/session-after-link'
import { setSessionCookie } from '@/lib/auth/set-session-cookie'
import { confirmationRateLimit } from '@/lib/auth/sign-up-rate-limits'

/**
 * « Continuer » on the confirmation page (ticket 302): opens the session of the account whose link she
 * holds, once, and sends her to « Prépare ton profil ». The code comes from the cookie the proxy kept
 * it in, never from the form. Whatever goes wrong (spent link, past the window, blocked account, a
 * failure), she lands on the sign-in page that leads to the same place, as before; nothing says why.
 *
 * The origin is checked as in the other actions of the space.
 */
export async function continueAfterConfirmation(): Promise<never> {
	const payload = await getPayload({ config })
	const requestHeaders = await headers()
	const requestOrigin = requestHeaders.get('origin')
	const toSignIn = signInUrl(ACCOUNT_ONBOARDING_PAGE)
	if (requestOrigin !== null && !payload.config.csrf.includes(requestOrigin)) redirect(toSignIn)

	const jar = await cookies()
	const code = jar.get(CONFIRMATION_COOKIE)?.value
	// The code is spent whatever happens next: a second click starts nothing.
	jar.delete({ name: CONFIRMATION_COOKIE, path: CONFIRMATION_PAGE })

	const session = confirmationRateLimit.prendre(ipClient(requestHeaders)).autorise
		? await openSessionAfterConfirmation({ payload, code, journal: authLog(payload) })
		: { ok: false as const }
	if (!session.ok) redirect(toSignIn)

	await setSessionCookie(payload, session.token)
	// `redirect` throws: it stays outside any try/catch.
	redirect(ACCOUNT_ONBOARDING_PAGE)
}
