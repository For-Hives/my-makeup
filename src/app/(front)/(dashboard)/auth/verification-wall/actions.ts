'use server'

import config from '@payload-config'
import { headers } from 'next/headers'
import { getPayload } from 'payload'
import type { ResendState } from '@/components/auth/ResendForm'
import { authLog } from '@/lib/auth/auth-log'
import { ipClient } from '@/lib/auth/client-ip'
import { RESEND_MESSAGES, resendConfirmation } from '@/lib/auth/resend'
import { resendRateLimit } from '@/lib/auth/sign-up-rate-limits'
import { logRefusal } from '@/lib/auth/sign-up-refusal'
import { envoiEmailDePayload } from '@/lib/emails/send'
import { serverEnv } from '@/lib/env'

/**
 * « Renvoyer l'email de confirmation », from the wall of verification (ticket 083). Braked by client
 * address here (10 an hour), and by mailbox inside `resendConfirmation` (1 a minute, 5 a day).
 * The answer is the same for an address with an account waiting, a confirmed one and an unknown one.
 */
export async function resendEmail(_precedent: ResendState, formulaire: FormData): Promise<ResendState> {
	const payload = await getPayload({ config })
	const requestHeaders = await headers()
	const requestOrigin = requestHeaders.get('origin')
	const input = formulaire.get('email')
	const value = typeof input === 'string' ? input : ''
	if (requestOrigin !== null && !payload.config.csrf.includes(requestOrigin))
		return { erreur: 'Le service est momentanément indisponible, réessaie dans quelques minutes.', valeur: value }

	const log = authLog(payload)
	const client = ipClient(requestHeaders)
	if (!resendRateLimit.prendre(client).autorise) {
		await logRefusal(log, client, 'resend', 'trop-de-tentatives')
		return { erreur: RESEND_MESSAGES['trop-de-tentatives'], valeur: value }
	}

	const result = await resendConfirmation({
		payload,
		email: value,
		envoyer: envoiEmailDePayload(payload, serverEnv()),
		site: process.env.NEXT_PUBLIC_SITE_URL ?? requestOrigin ?? 'http://localhost',
		journal: log,
	})
	if (result.ok) return { reussi: RESEND_MESSAGES.ok, valeur: value }
	if (result.code === 'email-invalide') return { erreur: result.message, valeur: value }
	if (result.code === 'trop-de-renvois') return { erreur: RESEND_MESSAGES[result.raison], valeur: value }
	return { erreur: RESEND_MESSAGES['email-non-envoye'], valeur: value }
}
