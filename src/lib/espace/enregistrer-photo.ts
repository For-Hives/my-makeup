import type { Payload } from 'payload'
import { identifiantDe } from '../profil/photos'
import { identifiantDuProfilAEcrire, type UtilisateurDeLEspace } from './mon-profil'
import { schemaDeLaPhoto, type ValeursDeLaPhoto } from './photo-principale'
import { echecDePayload, MESSAGE_ECHEC, type ResultatDEnregistrement } from './resultat'

/**
 * Saves the main photo of the signed-in makeup artist (ticket 134), on the contract of ticket 119.
 * The file itself has already been sent by the browser to the media route of Payload (ticket 133
 * checks its type, its size and its name); this names it as her main photo.
 *
 * - The request is read by the strict schema: one identifier, no other key.
 * - The profile written is hers, found by her account; the write goes through the access rules and
 *   the rules of the field as herself: the photo has to be one of her own media (ticket 043).
 * - The former photo goes to the bin of the storage once nothing references it (ticket 045): that
 *   is done by the hooks of the collection, in the same transaction as this write.
 * - The identifier given back is the one the database stored.
 */
export async function enregistrerPhotoPrincipale(
	payload: Payload,
	utilisateur: UtilisateurDeLEspace,
	saisie: unknown
): Promise<ResultatDEnregistrement<ValeursDeLaPhoto>> {
	const lue = schemaDeLaPhoto.safeParse(saisie)
	if (!lue.success) return { ok: false, message: MESSAGE_ECHEC }
	try {
		const id = await identifiantDuProfilAEcrire(payload, utilisateur)
		if (id === null) return { ok: false, message: MESSAGE_ECHEC }
		const stocke = await payload.update({
			collection: 'profiles',
			data: { mainPicture: Number(lue.data.photoPrincipale) },
			depth: 0,
			id,
			overrideAccess: false,
			user: utilisateur,
		})
		const photo = identifiantDe(stocke.mainPicture)
		if (photo === undefined) return { ok: false, message: MESSAGE_ECHEC }
		return { ok: true, valeurs: { photoPrincipale: photo } }
	} catch (erreur) {
		return echecDePayload(erreur, ['photoPrincipale'] as const, chemin =>
			chemin === 'mainPicture' ? 'photoPrincipale' : ''
		)
	}
}
