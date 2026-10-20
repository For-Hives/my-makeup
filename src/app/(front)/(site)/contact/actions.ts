'use server'

import config from '@payload-config'
import { headers } from 'next/headers'
import { after } from 'next/server'
import { getPayload } from 'payload'
import { ipClient } from '@/lib/auth/client-ip'
import { enregistrerUnMessageDeContact, stockageDePayload } from '@/lib/contact/payload-send'
import { type EtatDuContact, saisieDuContact } from '@/lib/contact/message'
import { envoiEmailDePayload } from '@/lib/emails/send'
import { serverEnv } from '@/lib/env'

/**
 * The contact form (ticket 158). The message is checked, stored, then sent to the team after the answer
 * (src/lib/contact/envoi-payload.ts). Next refuses a Server Action called from another origin before this
 * code runs; the origin is checked here as well, as for the sign-in.
 *
 * Brakes (ticket 161): the trap field and the limits are applied in `enregistrerUnMessageDeContact`. The proxy answers
 * a real 429 past 5 messages an hour from one address or 20 a day from one mailbox; the check here is the
 * authoritative one (it takes the places), and shows the same sentence with her typing kept if the proxy saw nothing.
 *
 * Whatever the mail does, a stored message is answered with the confirmation. Nothing she typed is logged.
 */
export async function sendMessage(_precedent: EtatDuContact, formulaire: FormData): Promise<EtatDuContact> {
	const values = saisieDuContact(formulaire)
	const payload = await getPayload({ config })
	const origin = (await headers()).get('origin')
	if (origin !== null && !payload.config.csrf.includes(origin)) return { echec: true, valeurs: values }

	const env = serverEnv()
	const client = ipClient(await headers())
	const result = await enregistrerUnMessageDeContact({
		formulaire,
		stockage: stockageDePayload(payload),
		envoyer: envoiEmailDePayload(payload, env),
		destinataire: env.contactTo,
		client,
		apres: travail => after(travail),
		journal: {
			info: ligne => payload.logger.info({ msg: ligne }),
			erreur: ligne => payload.logger.error({ msg: ligne }),
		},
	})
	if (result.ok) return { envoye: true }
	if (result.code === 'trop-de-messages') return { limite: true, valeurs: values }
	if (result.code === 'donnees-invalides') return { erreurs: result.erreurs, valeurs: values }
	return { echec: true, valeurs: values }
}
