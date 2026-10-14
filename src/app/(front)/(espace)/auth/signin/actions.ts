'use server'

import config from '@payload-config'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import { connecter } from '@/lib/auth/connexion'
import { poserLeCookieDeSession } from '@/lib/auth/cookie-session'
import type { CodeErreur } from '@/lib/auth/erreurs'
import { remplacerLeHashHerite } from '@/lib/auth/herite'
import { ouvrirParMotDePasse } from '@/lib/auth/jeton'
import { journalDe } from '@/lib/auth/journal'
import { retourSur } from '@/lib/auth/retour'

export type EtatDeConnexion = { code: CodeErreur } | null

/**
 * The sign-in form (ticket 074). Gives back an error code, never the account nor the token; on
 * success the session cookie is set and the visitor is sent to the page she asked for.
 *
 * Next refuses a Server Action called from another origin before this code runs. The origin is
 * checked here as well against the origins Payload trusts, so that the rule is written down and
 * does not depend on a Next setting.
 */
export async function seConnecter(_precedent: EtatDeConnexion, formulaire: FormData): Promise<EtatDeConnexion> {
	const payload = await getPayload({ config })
	const entetes = await headers()
	const origine = entetes.get('origin')
	if (origine !== null && !payload.config.csrf.includes(origine)) return { code: 'identifiants-invalides' }

	const resultat = await connecter({
		ouvrir: data => ouvrirParMotDePasse(payload, 'pros', data),
		headers: entetes,
		email: formulaire.get('email'),
		password: formulaire.get('password'),
		journal: journalDe(payload),
		herite: data => remplacerLeHashHerite(payload, data),
	})
	if (!resultat.ok) return { code: resultat.code }

	await poserLeCookieDeSession(payload, resultat.token)

	const site = process.env.NEXT_PUBLIC_SITE_URL ?? origine ?? 'http://localhost'
	const destination = retourSur(formulaire.get('callbackUrl'), site)
	// `redirect` throws: it stays outside any try/catch.
	redirect(destination)
}
