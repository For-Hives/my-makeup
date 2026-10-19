'use server'

import config from '@payload-config'
import { headers } from 'next/headers'
import { after } from 'next/server'
import { getPayload } from 'payload'
import type { EtatDeLaDemande } from '@/components/auth/ForgotPasswordForm'
import { journalDe } from '@/lib/auth/auth-log'
import { demanderUnLien } from '@/lib/auth/password-reset-payload'
import { envoiEmailDePayload } from '@/lib/emails/envoi'
import { serverEnv } from '@/lib/env'

/**
 * The first step of the forgotten password (ticket 085). It answers the same sentence for every
 * address that is one, and the mail leaves after the answer (ticket 086). Next refuses a Server
 * Action called from another origin before this code runs; the origin is checked here as well,
 * as for the sign-in.
 */
export async function demanderLeLien(_precedent: EtatDeLaDemande, formulaire: FormData): Promise<EtatDeLaDemande> {
	const payload = await getPayload({ config })
	const entetes = await headers()
	const origine = entetes.get('origin')
	if (origine !== null && !payload.config.csrf.includes(origine)) return { code: 'service-indisponible' }

	const resultat = await demanderUnLien({
		payload,
		headers: entetes,
		email: formulaire.get('email'),
		apres: travail => after(travail),
		envoyer: envoiEmailDePayload(payload, serverEnv()),
		site: process.env.NEXT_PUBLIC_SITE_URL ?? origine ?? 'http://localhost',
		journal: journalDe(payload),
	})
	return resultat.ok ? { envoyee: true } : { code: resultat.code }
}
