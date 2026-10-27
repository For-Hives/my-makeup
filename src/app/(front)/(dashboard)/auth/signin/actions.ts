'use server'

import config from '@payload-config'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import { markAttributes, SIGN_IN_MARK_COOKIE } from '@/lib/analytics/sign-in-mark'
import { authLog } from '@/lib/auth/auth-log'
import type { ErrorCode } from '@/lib/auth/errors'
import { replaceLegacyHash } from '@/lib/auth/legacy'
import { safeReturnTo } from '@/lib/auth/return-to'
import { setSessionCookie } from '@/lib/auth/set-session-cookie'
import { signInWithPassword } from '@/lib/auth/sign-in'
import { openWithPassword } from '@/lib/auth/token'

export type SignInState = { code: ErrorCode } | null

/**
 * The sign-in form (ticket 074). Gives back an error code, never the account nor the token; on
 * success the session cookie is set and the visitor is sent to the page she asked for.
 *
 * Next refuses a Server Action called from another origin before this code runs. The origin is
 * checked here as well against the origins Payload trusts, so that the rule is written down and
 * does not depend on a Next setting.
 */
export async function signIn(_precedent: SignInState, formulaire: FormData): Promise<SignInState> {
	const payload = await getPayload({ config })
	const requestHeaders = await headers()
	const requestOrigin = requestHeaders.get('origin')
	if (requestOrigin !== null && !payload.config.csrf.includes(requestOrigin)) return { code: 'identifiants-invalides' }

	const result = await signInWithPassword({
		ouvrir: data => openWithPassword(payload, 'pros', data),
		headers: requestHeaders,
		email: formulaire.get('email'),
		password: formulaire.get('password'),
		journal: authLog(payload),
		herite: data => replaceLegacyHash(payload, data),
	})
	if (!result.ok) return { code: result.code }

	await setSessionCookie(payload, result.token)
	// Tells the next page to send `login_result` (ticket 146).
	;(await cookies()).set(SIGN_IN_MARK_COOKIE, 'email', markAttributes(process.env.NODE_ENV === 'production'))

	const site = process.env.NEXT_PUBLIC_SITE_URL ?? requestOrigin ?? 'http://localhost'
	// `redirect` throws: it stays outside any try/catch.
	redirect(safeReturnTo(formulaire.get('callbackUrl'), site))
}
