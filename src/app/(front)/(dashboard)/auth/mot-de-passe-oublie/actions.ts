'use server'

import config from '@payload-config'
import { headers } from 'next/headers'
import { after } from 'next/server'
import { getPayload } from 'payload'
import type { ForgotPasswordState } from '@/components/auth/ForgotPasswordForm'
import { authLog } from '@/lib/auth/auth-log'
import { requestPasswordLink } from '@/lib/auth/password-reset-payload'
import { envoiEmailDePayload } from '@/lib/emails/send'
import { serverEnv } from '@/lib/env'

/**
 * The first step of the forgotten password (ticket 085). It answers the same sentence for every
 * address that is one, and the mail leaves after the answer (ticket 086). Next refuses a Server
 * Action called from another origin before this code runs; the origin is checked here as well,
 * as for the sign-in.
 */
export async function forgotPassword(
	_precedent: ForgotPasswordState,
	formulaire: FormData
): Promise<ForgotPasswordState> {
	const payload = await getPayload({ config })
	const requestHeaders = await headers()
	const requestOrigin = requestHeaders.get('origin')
	if (requestOrigin !== null && !payload.config.csrf.includes(requestOrigin)) return { code: 'service-indisponible' }

	const result = await requestPasswordLink({
		payload,
		headers: requestHeaders,
		email: formulaire.get('email'),
		apres: travail => after(travail),
		envoyer: envoiEmailDePayload(payload, serverEnv()),
		site: process.env.NEXT_PUBLIC_SITE_URL ?? requestOrigin ?? 'http://localhost',
		journal: authLog(payload),
	})
	return result.ok ? { envoyee: true } : { code: result.code }
}
