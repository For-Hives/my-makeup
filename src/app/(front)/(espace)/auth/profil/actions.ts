'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import type { CoordonneesEnregistrees } from '@/lib/espace/coordonnees'
import type { ValeursDeLaDescription } from '@/lib/espace/description'
import type { ValeursDeLaDisponibilite } from '@/lib/espace/disponibilite'
import { enregistrerCoordonnees } from '@/lib/espace/enregistrer-coordonnees'
import { enregistrerDescription } from '@/lib/espace/enregistrer-description'
import { enregistrerDisponibilite } from '@/lib/espace/enregistrer-disponibilite'
import { enregistrerIdentite } from '@/lib/espace/enregistrer-identite'
import { enregistrerCompetences, enregistrerLangues } from '@/lib/espace/enregistrer-puces'
import { enregistrerReseaux } from '@/lib/espace/enregistrer-reseaux'
import type { ValeursDeLIdentite } from '@/lib/espace/identite'
import type { ValeursDesPuces } from '@/lib/espace/puces'
import { utilisatriceDeLaRequete } from '@/lib/espace/requete'
import type { ValeursDesReseaux } from '@/lib/espace/reseaux'
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

/**
 * Saves the description of the signed-in makeup artist (ticket 122), under the same guards as her
 * identity: session read again, origin checked, profile found by her account.
 */
export async function enregistrerMaDescription(
	saisie: unknown
): Promise<ResultatDEnregistrement<ValeursDeLaDescription>> {
	const contexte = await utilisatriceDeLaRequete()
	if (contexte === null) return { ok: false, message: MESSAGE_SESSION, session: 'expiree' }
	const { payload, utilisateur } = contexte
	const origine = (await headers()).get('origin')
	if (origine !== null && !payload.config.csrf.includes(origine)) return { ok: false, message: MESSAGE_ECHEC }

	const resultat = await enregistrerDescription(payload, utilisateur, saisie)
	if (resultat.ok) revalidatePath('/auth/profil')
	return resultat
}

/**
 * Saves the availability of the signed-in makeup artist (ticket 124), on the same terms as her
 * identity. The public list and the search read it under the tags of `profils`: the write refreshes
 * them through the hooks of the collection.
 */
export async function enregistrerMaDisponibilite(
	saisie: unknown
): Promise<ResultatDEnregistrement<ValeursDeLaDisponibilite>> {
	const contexte = await utilisatriceDeLaRequete()
	if (contexte === null) return { ok: false, message: MESSAGE_SESSION, session: 'expiree' }
	const { payload, utilisateur } = contexte
	const origine = (await headers()).get('origin')
	if (origine !== null && !payload.config.csrf.includes(origine)) return { ok: false, message: MESSAGE_ECHEC }

	const resultat = await enregistrerDisponibilite(payload, utilisateur, saisie)
	if (resultat.ok) revalidatePath('/auth/profil')
	return resultat
}

/**
 * Saves the networks and the website of the signed-in makeup artist (ticket 125): same guards as
 * the identity, the session read again, the origin checked, the profile found by her account.
 */
export async function enregistrerMesReseaux(saisie: unknown): Promise<ResultatDEnregistrement<ValeursDesReseaux>> {
	const contexte = await utilisatriceDeLaRequete()
	if (contexte === null) return { ok: false, message: MESSAGE_SESSION, session: 'expiree' }
	const { payload, utilisateur } = contexte
	const origine = (await headers()).get('origin')
	if (origine !== null && !payload.config.csrf.includes(origine)) return { ok: false, message: MESSAGE_ECHEC }

	const resultat = await enregistrerReseaux(payload, utilisateur, saisie)
	if (resultat.ok) revalidatePath('/auth/profil')
	return resultat
}

/**
 * Saves the contact details of the signed-in makeup artist and her choice to show them (ticket
 * 126): same guards as the identity. The server dates her choice; the request cannot.
 */
export async function enregistrerMesCoordonnees(
	saisie: unknown
): Promise<ResultatDEnregistrement<CoordonneesEnregistrees>> {
	const contexte = await utilisatriceDeLaRequete()
	if (contexte === null) return { ok: false, message: MESSAGE_SESSION, session: 'expiree' }
	const { payload, utilisateur } = contexte
	const origine = (await headers()).get('origin')
	if (origine !== null && !payload.config.csrf.includes(origine)) return { ok: false, message: MESSAGE_ECHEC }

	const resultat = await enregistrerCoordonnees(payload, utilisateur, saisie)
	if (resultat.ok) revalidatePath('/auth/profil')
	return resultat
}

/**
 * Saves the languages of the signed-in makeup artist (ticket 127): same guards as the identity, the
 * session read again, the origin checked, the profile found by her account.
 */
export async function enregistrerMesLangues(saisie: unknown): Promise<ResultatDEnregistrement<ValeursDesPuces>> {
	const contexte = await utilisatriceDeLaRequete()
	if (contexte === null) return { ok: false, message: MESSAGE_SESSION, session: 'expiree' }
	const { payload, utilisateur } = contexte
	const origine = (await headers()).get('origin')
	if (origine !== null && !payload.config.csrf.includes(origine)) return { ok: false, message: MESSAGE_ECHEC }

	const resultat = await enregistrerLangues(payload, utilisateur, saisie)
	if (resultat.ok) revalidatePath('/auth/profil')
	return resultat
}

/** Saves the skills of the signed-in makeup artist (ticket 128), on the same terms as her languages. */
export async function enregistrerMesCompetences(saisie: unknown): Promise<ResultatDEnregistrement<ValeursDesPuces>> {
	const contexte = await utilisatriceDeLaRequete()
	if (contexte === null) return { ok: false, message: MESSAGE_SESSION, session: 'expiree' }
	const { payload, utilisateur } = contexte
	const origine = (await headers()).get('origin')
	if (origine !== null && !payload.config.csrf.includes(origine)) return { ok: false, message: MESSAGE_ECHEC }

	const resultat = await enregistrerCompetences(payload, utilisateur, saisie)
	if (resultat.ok) revalidatePath('/auth/profil')
	return resultat
}
