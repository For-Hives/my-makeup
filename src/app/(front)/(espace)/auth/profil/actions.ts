'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { enregistrerIdentite } from '@/lib/espace/enregistrer-identite'
import type { ValeursDeLIdentite } from '@/lib/espace/identite'
import { utilisatriceDeLaRequete } from '@/lib/espace/requete'
import { MESSAGE_ECHEC, MESSAGE_SESSION, type ResultatDEnregistrement } from '@/lib/espace/resultat'

/**
 * Saves the identity of the signed-in makeup artist (ticket 119). An action is a public endpoint:
 * the session is read again here, the origin is checked against the origins Payload trusts, and the
 * profile written is the one of her account, never one named by the request.
 *
 * It gives back the values the database stored, or a message in French; it never redirects, so the
 * form keeps what was typed (ticket 121 adds the way back after a new sign-in).
 */
export async function enregistrerMonIdentite(saisie: unknown): Promise<ResultatDEnregistrement<ValeursDeLIdentite>> {
	const contexte = await utilisatriceDeLaRequete()
	if (contexte === null) return { ok: false, message: MESSAGE_SESSION, session: 'expiree' }
	const { payload, utilisateur } = contexte
	const origine = (await headers()).get('origin')
	if (origine !== null && !payload.config.csrf.includes(origine)) return { ok: false, message: MESSAGE_ECHEC }

	const resultat = await enregistrerIdentite(payload, utilisateur, saisie)
	if (resultat.ok) revalidatePath('/auth/profil')
	return resultat
}
