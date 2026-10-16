import type { Payload } from 'payload'
import { estDisponible, schemaDeLaDisponibilite, type ValeursDeLaDisponibilite } from './disponibilite'
import { identifiantDuProfilAEcrire, type UtilisateurDeLEspace } from './mon-profil'
import { echecDePayload, MESSAGE_ECHEC, type ResultatDEnregistrement } from './resultat'

/**
 * Saves the availability of the signed-in makeup artist (ticket 124), on the contract of ticket
 * 119: the request is read by the strict schema (one boolean, no other key), the profile written is
 * hers (found by her account), the write goes through the access rules as herself, and the value
 * given back is the one the database stored. A failure gives a message in French and no value.
 */
export async function enregistrerDisponibilite(
	payload: Payload,
	utilisateur: UtilisateurDeLEspace,
	saisie: unknown
): Promise<ResultatDEnregistrement<ValeursDeLaDisponibilite>> {
	const lue = schemaDeLaDisponibilite.safeParse(saisie)
	if (!lue.success) return { ok: false, message: MESSAGE_ECHEC }
	try {
		const id = await identifiantDuProfilAEcrire(payload, utilisateur)
		if (id === null) return { ok: false, message: MESSAGE_ECHEC }
		const stocke = await payload.update({
			collection: 'profils',
			data: lue.data,
			depth: 0,
			id,
			overrideAccess: false,
			user: utilisateur,
		})
		return { ok: true, valeurs: { disponible: estDisponible(stocke.disponible) } }
	} catch (erreur) {
		return echecDePayload(erreur, ['disponible'] as const)
	}
}
