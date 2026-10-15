'use server'

import config from '@payload-config'
import { headers } from 'next/headers'
import { after } from 'next/server'
import { getPayload } from 'payload'
import { ipClient } from '@/lib/auth/ip-client'
import { enregistrerUnMessageDeContact, stockageDePayload } from '@/lib/contact/envoi-payload'
import { type EtatDuContact, saisieDuContact } from '@/lib/contact/message'
import { envoiEmailDePayload } from '@/lib/emails/envoi'
import { serverEnv } from '@/lib/env'

/**
 * The contact form (ticket 158). The message is checked, stored, then sent to the team after the answer
 * (src/lib/contact/envoi-payload.ts). Next refuses a Server Action called from another origin before this
 * code runs; the origin is checked here as well, as for the sign-in.
 *
 * Brakes (ticket 161): the trap field and the limits are applied in `enregistrerUnMessageDeContact`. The proxy answers
 * a real 429 past 5 messages an hour from one address; the check here is the second line, and the only one for
 * the 20 a day by mailbox (a refusal shown by the form, with her typing kept).
 *
 * Whatever the mail does, a stored message is answered with the confirmation. Nothing she typed is logged.
 */
export async function envoyerUnMessage(_precedent: EtatDuContact, formulaire: FormData): Promise<EtatDuContact> {
	const valeurs = saisieDuContact(formulaire)
	const payload = await getPayload({ config })
	const origine = (await headers()).get('origin')
	if (origine !== null && !payload.config.csrf.includes(origine)) return { echec: true, valeurs }

	const env = serverEnv()
	const client = ipClient(await headers())
	const resultat = await enregistrerUnMessageDeContact({
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
	if (resultat.ok) return { envoye: true }
	if (resultat.code === 'trop-de-messages') return { limite: true, valeurs }
	if (resultat.code === 'donnees-invalides') return { erreurs: resultat.erreurs, valeurs }
	return { echec: true, valeurs }
}
