'use server'

import { headers } from 'next/headers'
import { after } from 'next/server'
import { authLog } from '@/lib/auth/auth-log'
import { PASSWORD_MESSAGES } from '@/lib/auth/forgot-password'
import { requestPasswordLink } from '@/lib/auth/password-reset-payload'
import { CHANGE_MESSAGES, changeMyPassword, type PasswordChangeResult } from '@/lib/dashboard/change-password'
import { requestUser } from '@/lib/dashboard/request'
import { payloadSendEmail } from '@/lib/emails/send'
import { serverEnv } from '@/lib/env'

/**
 * Changes the password of the signed-in makeup artist (ticket 999), once she has retyped her current one. An
 * action is a public endpoint: the session is read again by `changeMyPassword` from the cookie, the origin is
 * checked against the origins Payload trusts, and the account changed is the one of the session, never one named
 * by the request. The session stays; the others are closed. It gives back a message in French and never a password.
 */
export async function changeMyPasswordAction(saisie: unknown): Promise<PasswordChangeResult> {
	const context = await requestUser()
	if (context === null) return { ok: false, code: 'session', message: CHANGE_MESSAGES.session, session: 'expiree' }
	const { payload } = context
	const requestHeaders = await headers()
	const origin = requestHeaders.get('origin')
	if (origin !== null && !payload.config.csrf.includes(origin))
		return { ok: false, code: 'echec', message: CHANGE_MESSAGES.echec }

	return changeMyPassword({
		payload,
		headers: requestHeaders,
		saisie,
		envoyer: payloadSendEmail(payload, serverEnv()),
		site: process.env.NEXT_PUBLIC_SITE_URL ?? origin ?? 'http://localhost',
		apres: travail => after(travail),
		journal: authLog(payload),
	})
}

export type SetPasswordLinkResult = { ok: true; message: string } | { ok: false; message: string; session?: 'expiree' }

/**
 * « Définir un mot de passe » for an account that holds none she knows: the link of the forgotten password, sent to
 * the address of her account. The address comes from the session, never from the request. The brakes and the
 * pause between two mails are those of the forgotten password.
 */
export async function requestSetPasswordLinkAction(): Promise<SetPasswordLinkResult> {
	const context = await requestUser()
	if (context === null) return { ok: false, message: CHANGE_MESSAGES.session, session: 'expiree' }
	const { payload, utilisateur: user } = context
	const requestHeaders = await headers()
	const origin = requestHeaders.get('origin')
	if (origin !== null && !payload.config.csrf.includes(origin)) return { ok: false, message: CHANGE_MESSAGES.echec }

	const result = await requestPasswordLink({
		payload,
		headers: requestHeaders,
		email: user.email,
		apres: travail => after(travail),
		envoyer: payloadSendEmail(payload, serverEnv()),
		site: process.env.NEXT_PUBLIC_SITE_URL ?? origin ?? 'http://localhost',
		journal: authLog(payload),
	})
	return result.ok
		? { ok: true, message: CHANGE_MESSAGES.lienEnvoye }
		: { ok: false, message: PASSWORD_MESSAGES[result.code] }
}
