'use server'

import { cookies, headers } from 'next/headers'
import { MESSAGES_DE_SUPPRESSION, type ResultatDeLaSuppression } from '@/lib/dashboard/confirmation-suppression'
import { utilisatriceDeLaRequete } from '@/lib/dashboard/requete'
import { supprimerMonCompte } from '@/lib/dashboard/supprimer-compte'

/**
 * Deletes the account of the signed-in makeup artist (ticket 141), once she has retyped her
 * password or her address. An action is a public endpoint: the session is read again here, the
 * origin is checked against the origins Payload trusts, and the account deleted is the one of the
 * session, never one named by the request.
 *
 * On success the session cookie is cleared (the session itself went with the account) and the form
 * sends the browser to the home page. It gives back a message in French otherwise, and nothing was
 * deleted.
 */
export async function supprimerMonCompteAction(saisie: unknown): Promise<ResultatDeLaSuppression> {
	const contexte = await utilisatriceDeLaRequete()
	if (contexte === null) return { ok: false, message: MESSAGES_DE_SUPPRESSION.session, session: 'expiree' }
	const { payload, utilisateur } = contexte
	const entetes = await headers()
	const origine = entetes.get('origin')
	if (origine !== null && !payload.config.csrf.includes(origine))
		return { ok: false, message: MESSAGES_DE_SUPPRESSION.echec }

	const resultat = await supprimerMonCompte({ payload, compte: utilisateur, headers: entetes, saisie })
	if (resultat.ok) {
		const auth = payload.collections.pros.config.auth
		;(await cookies()).delete({ name: `${payload.config.cookiePrefix}-token`, path: '/', domain: auth.cookies.domain })
	}
	return resultat
}
