'use server'

import config from '@payload-config'
import { headers } from 'next/headers'
import { after } from 'next/server'
import { getPayload } from 'payload'
import type { EtatDeLaDemande } from '@/components/auth/FormulaireMotDePasseOublie'
import { journalDe } from '@/lib/auth/journal'
import { demanderUnLien } from '@/lib/auth/reinitialisation-payload'

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
		journal: journalDe(payload),
	})
	return resultat.ok ? { envoyee: true } : { code: resultat.code }
}
