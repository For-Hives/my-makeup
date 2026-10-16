import type { Payload } from 'payload'
import {
	CHAMPS_DE_LA_DESCRIPTION,
	erreursDeLaDescription,
	schemaDeLaDescriptionStrict,
	type ValeursDeLaDescription,
} from './description'
import { identifiantDuProfilAEcrire, type UtilisateurDeLEspace } from './mon-profil'
import { echecDePayload, MESSAGE_ECHEC, type ResultatDEnregistrement } from './resultat'

/**
 * Saves the description of the signed-in makeup artist (ticket 122), the way her identity is saved
 * (ticket 119):
 *
 * - the request is read by the strict schema: HTML is removed, 2 001 characters are refused (U27),
 *   a key that is not `description` refuses the whole request (U32);
 * - the profile written is hers, found by her account, through the access rules and the hooks of
 *   the collection (`overrideAccess: false`): nothing but the description changes;
 * - the value given back is the one the database stored, never the one that was sent. A failure
 *   gives back a message in French, and the old text stays.
 *
 * It never reads `error.message`: see `echecDePayload`.
 */
export async function enregistrerDescription(
	payload: Payload,
	utilisateur: UtilisateurDeLEspace,
	saisie: unknown
): Promise<ResultatDEnregistrement<ValeursDeLaDescription>> {
	const lue = schemaDeLaDescriptionStrict.safeParse(saisie)
	if (!lue.success) {
		const champs = erreursDeLaDescription(lue.error)
		return Object.keys(champs).length > 0
			? { ok: false, message: 'Un champ n’est pas valide : corrige-le, puis enregistre à nouveau.', champs }
			: { ok: false, message: MESSAGE_ECHEC }
	}
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
		return { ok: true, valeurs: { description: stocke.description ?? '' } }
	} catch (erreur) {
		return echecDePayload(erreur, CHAMPS_DE_LA_DESCRIPTION)
	}
}
