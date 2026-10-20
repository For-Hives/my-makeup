import type { Payload } from 'payload'
import { identifiantDe } from '../profil/photos'
import { type PhotoValues, photoSchema } from './main-picture'
import { type DashboardUser, profileIdToWrite } from './my-profile'
import { FAILURE_MESSAGE, payloadFailure, type SaveResult } from './result'

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
export async function saveMainPicture(
	payload: Payload,
	utilisateur: DashboardUser,
	saisie: unknown
): Promise<SaveResult<PhotoValues>> {
	const parsed = photoSchema.safeParse(saisie)
	if (!parsed.success) return { ok: false, message: FAILURE_MESSAGE }
	try {
		const id = await profileIdToWrite(payload, utilisateur)
		if (id === null) return { ok: false, message: FAILURE_MESSAGE }
		const stored = await payload.update({
			collection: 'profiles',
			data: { mainPicture: Number(parsed.data.photoPrincipale) },
			depth: 0,
			id,
			overrideAccess: false,
			user: utilisateur,
		})
		const photo = identifiantDe(stored.mainPicture)
		if (photo === undefined) return { ok: false, message: FAILURE_MESSAGE }
		return { ok: true, valeurs: { photoPrincipale: photo } }
	} catch (error) {
		return payloadFailure(error, ['photoPrincipale'] as const, chemin =>
			chemin === 'mainPicture' ? 'photoPrincipale' : ''
		)
	}
}
