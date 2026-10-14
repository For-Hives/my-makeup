'use server'

import config from '@payload-config'
import { headers } from 'next/headers'
import { getPayload } from 'payload'
import type { EtatDeRenvoi } from '@/components/auth/FormulaireDeRenvoi'
import { freinDeRenvoi } from '@/lib/auth/freins-inscription'
import { ipClient } from '@/lib/auth/ip-client'
import { journalDe } from '@/lib/auth/journal'
import { journaliserUnRefus } from '@/lib/auth/refus-inscription'
import { MESSAGES_RENVOI, renvoyerLaConfirmation } from '@/lib/auth/renvoi'
import { envoiEmailDePayload } from '@/lib/emails/envoi'
import { serverEnv } from '@/lib/env'

/**
 * « Renvoyer l'email de confirmation », from the wall of verification (ticket 083). Braked by client
 * address here (10 an hour), and by mailbox inside `renvoyerLaConfirmation` (1 a minute, 5 a day).
 * The answer is the same for an address with an account waiting, a confirmed one and an unknown one.
 */
export async function renvoyerLEmail(_precedent: EtatDeRenvoi, formulaire: FormData): Promise<EtatDeRenvoi> {
	const payload = await getPayload({ config })
	const entetes = await headers()
	const origine = entetes.get('origin')
	const saisie = formulaire.get('email')
	const valeur = typeof saisie === 'string' ? saisie : ''
	if (origine !== null && !payload.config.csrf.includes(origine))
		return { erreur: 'Le service est momentanément indisponible, réessaie dans quelques minutes.', valeur }

	const journal = journalDe(payload)
	const client = ipClient(entetes)
	if (!freinDeRenvoi.prendre(client).autorise) {
		await journaliserUnRefus(journal, client, 'renvoi', 'trop-de-tentatives')
		return { erreur: MESSAGES_RENVOI['trop-de-tentatives'], valeur }
	}

	const resultat = await renvoyerLaConfirmation({
		payload,
		email: valeur,
		envoyer: envoiEmailDePayload(payload, serverEnv()),
		site: process.env.NEXT_PUBLIC_SITE_URL ?? origine ?? 'http://localhost',
		journal,
	})
	if (resultat.ok) return { reussi: MESSAGES_RENVOI.ok, valeur }
	if (resultat.code === 'email-invalide') return { erreur: resultat.message, valeur }
	if (resultat.code === 'trop-de-renvois') return { erreur: MESSAGES_RENVOI[resultat.raison], valeur }
	return { erreur: MESSAGES_RENVOI['email-non-envoye'], valeur }
}
